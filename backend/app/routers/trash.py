import logging
from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_github_token
from app.models import Folder, Image, User
from app.schemas import FolderResponse, ImageResponse, TrashContents
from app.services.github import GitHubService
from app.services.storage import StorageService
from app.services.activity import log_activity

logger = logging.getLogger(__name__)
router = APIRouter(tags=["trash"])


def _folder_response(folder: Folder) -> FolderResponse:
    # Count non-deleted subfolders and images
    subfolders_count = sum(1 for f in folder.children if f.deleted_at is None)
    images_count = sum(1 for img in folder.images if img.deleted_at is None)
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        github_path=folder.github_path,
        created_at=folder.created_at,
        subfolder_count=subfolders_count,
        image_count=images_count,
    )


async def _permanently_delete_image(db: Session, image: Image, token: str, owner: str, repo: str):
    # Delete thumbnail if it exists
    if image.thumbnail_path:
        try:
            thumb_info = await GitHubService.get_file_content(token, owner, repo, image.thumbnail_path)
            await StorageService.delete_file(token, owner, repo, image.thumbnail_path, thumb_info["sha"], "Delete thumbnail")
        except Exception:
            logger.warning("Failed to delete thumbnail %s from GitHub during permanent delete", image.thumbnail_path)

    # Delete original image
    try:
        await StorageService.delete_file(token, owner, repo, image.github_path, image.github_sha, f"Permanently delete image: {image.filename}")
    except Exception:
        logger.warning("Failed to delete image %s from GitHub during permanent delete", image.github_path)

    db.delete(image)


async def _permanently_delete_folder(db: Session, folder: Folder, token: str, owner: str, repo: str):
    # Recursively delete images in the folder
    images = list(folder.images)
    for img in images:
        await _permanently_delete_image(db, img, token, owner, repo)

    # Recursively delete child folders
    children = list(folder.children)
    for child in children:
        await _permanently_delete_folder(db, child, token, owner, repo)

    # Delete folder's .gitkeep
    try:
        gitkeep_info = await GitHubService.get_file_content(token, owner, repo, f"{folder.github_path}/.gitkeep")
        await StorageService.delete_file(token, owner, repo, f"{folder.github_path}/.gitkeep", gitkeep_info["sha"], f"Delete folder: {folder.github_path}")
    except Exception:
        logger.warning("No .gitkeep found or failed to delete for %s", folder.github_path)

    db.delete(folder)


def _restore_parent_recursive(db: Session, folder: Folder):
    if folder.parent_id:
        parent = db.query(Folder).filter(Folder.id == folder.parent_id).first()
        if parent and parent.deleted_at is not None:
            parent.deleted_at = None
            _restore_parent_recursive(db, parent)


# ── Auto cleanup helper ───────────────────────────────────────────────

async def _auto_cleanup_expired_trash(db: Session, user: User, token: str):
    """Permanently delete items soft-deleted more than 30 days ago."""
    threshold = datetime.now(timezone.utc) - timedelta(days=30)
    
    # Expired images
    expired_images = db.query(Image).filter(
        Image.user_id == user.id,
        Image.deleted_at.isnot(None),
        Image.deleted_at < threshold
    ).all()
    
    for img in expired_images:
        await _permanently_delete_image(db, img, token, user.repository_owner, user.repository_name)
        
    # Expired folders
    expired_folders = db.query(Folder).filter(
        Folder.user_id == user.id,
        Folder.deleted_at.isnot(None),
        Folder.deleted_at < threshold
    ).all()
    
    for fold in expired_folders:
        await _permanently_delete_folder(db, fold, token, user.repository_owner, user.repository_name)
        
    if expired_images or expired_folders:
        db.commit()
        logger.info("Auto-cleanup completed for user %s: deleted %d images, %d folders", user.id, len(expired_images), len(expired_folders))


# ── Routes ────────────────────────────────────────────────────────────

@router.get("/", response_model=TrashContents)
async def list_trash(
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """List all soft-deleted folders and images."""
    if user.repository_name and user.repository_owner:
        await _auto_cleanup_expired_trash(db, user, token)

    folders = (
        db.query(Folder)
        .filter(Folder.user_id == user.id, Folder.deleted_at.isnot(None))
        .all()
    )
    images = (
        db.query(Image)
        .filter(Image.user_id == user.id, Image.deleted_at.isnot(None))
        .all()
    )

    return TrashContents(
        folders=[_folder_response(f) for f in folders],
        images=[ImageResponse.model_validate(img) for img in images],
    )


@router.post("/restore/{item_type}/{item_id}", status_code=status.HTTP_200_OK)
async def restore_trash_item(
    item_type: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore a soft-deleted folder or image."""
    if item_type == "folder":
        folder = (
            db.query(Folder)
            .filter(Folder.id == item_id, Folder.user_id == user.id, Folder.deleted_at.isnot(None))
            .first()
        )
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found in trash.")

        # Restore folder and parents
        folder.deleted_at = None
        _restore_parent_recursive(db, folder)
        
        # Recursively restore children (subfolders and images)
        def _restore_children_recursive(f: Folder):
            f.deleted_at = None
            for child_img in f.images:
                child_img.deleted_at = None
            for child_fold in f.children:
                _restore_children_recursive(child_fold)
        
        _restore_children_recursive(folder)
        db.commit()

        log_activity(db, user.id, "restore_folder", {"folder_id": folder.id, "name": folder.name})
        return {"status": "restored", "type": "folder", "id": item_id}

    elif item_type == "image":
        image = (
            db.query(Image)
            .filter(Image.id == item_id, Image.user_id == user.id, Image.deleted_at.isnot(None))
            .first()
        )
        if not image:
            raise HTTPException(status_code=404, detail="Image not found in trash.")

        # Restore image
        image.deleted_at = None
        
        # Restore containing folder and parents if they were deleted
        if image.folder_id:
            parent_folder = db.query(Folder).filter(Folder.id == image.folder_id).first()
            if parent_folder and parent_folder.deleted_at is not None:
                parent_folder.deleted_at = None
                _restore_parent_recursive(db, parent_folder)

        db.commit()

        log_activity(db, user.id, "restore_image", {"image_id": image.id, "filename": image.filename})
        return {"status": "restored", "type": "image", "id": item_id}

    else:
        raise HTTPException(status_code=400, detail="Invalid item type. Use 'folder' or 'image'.")


@router.delete("/empty", status_code=status.HTTP_204_NO_CONTENT)
async def empty_trash(
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """Permanently delete all soft-deleted items for the user."""
    if not user.repository_name or not user.repository_owner:
        raise HTTPException(status_code=400, detail="No repository selected.")

    folders = (
        db.query(Folder)
        .filter(Folder.user_id == user.id, Folder.deleted_at.isnot(None))
        .all()
    )
    images = (
        db.query(Image)
        .filter(Image.user_id == user.id, Image.deleted_at.isnot(None))
        .all()
    )

    for img in images:
        await _permanently_delete_image(db, img, token, user.repository_owner, user.repository_name)

    for fold in folders:
        await _permanently_delete_folder(db, fold, token, user.repository_owner, user.repository_name)

    db.commit()
    log_activity(db, user.id, "empty_trash", {"deleted_folders_count": len(folders), "deleted_images_count": len(images)})


@router.delete("/{item_type}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trash_item_permanently(
    item_type: str,
    item_id: str,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """Permanently delete a single trash item."""
    if not user.repository_name or not user.repository_owner:
        raise HTTPException(status_code=400, detail="No repository selected.")

    if item_type == "folder":
        folder = (
            db.query(Folder)
            .filter(Folder.id == item_id, Folder.user_id == user.id, Folder.deleted_at.isnot(None))
            .first()
        )
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found in trash.")

        folder_name = folder.name
        await _permanently_delete_folder(db, folder, token, user.repository_owner, user.repository_name)
        db.commit()
        log_activity(db, user.id, "permanent_delete_folder", {"folder_id": item_id, "name": folder_name})

    elif item_type == "image":
        image = (
            db.query(Image)
            .filter(Image.id == item_id, Image.user_id == user.id, Image.deleted_at.isnot(None))
            .first()
        )
        if not image:
            raise HTTPException(status_code=404, detail="Image not found in trash.")

        filename = image.filename
        await _permanently_delete_image(db, image, token, user.repository_owner, user.repository_name)
        db.commit()
        log_activity(db, user.id, "permanent_delete_image", {"image_id": item_id, "filename": filename})

    else:
        raise HTTPException(status_code=400, detail="Invalid item type.")
