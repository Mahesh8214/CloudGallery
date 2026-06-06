"""
Folder management router.

Endpoints:
  GET    /api/folders            → List root folders for the current user.
  GET    /api/folders/{id}       → Get folder contents (subfolders + paginated images + breadcrumbs).
  POST   /api/folders            → Create a new folder.
  PUT    /api/folders/{id}/rename → Rename a folder.
  DELETE /api/folders/{id}       → Delete a folder (soft-delete).
"""

import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_github_token
from app.models import Folder, Image, User
from app.schemas import (
    BreadcrumbItem,
    FolderContents,
    FolderCreate,
    FolderRename,
    FolderResponse,
    ImageResponse,
    PaginatedImages,
)
from app.services.storage import StorageService
from app.services.activity import log_activity
from app.utils.validators import validate_folder_name

logger = logging.getLogger(__name__)
router = APIRouter(tags=["folders"])


def _folder_response(folder: Folder) -> FolderResponse:
    """Convert a Folder ORM instance to a FolderResponse."""
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


def _build_breadcrumbs(folder: Folder) -> List[BreadcrumbItem]:
    """Walk up the parent chain to build breadcrumb trail."""
    crumbs = []
    current = folder
    while current is not None:
        crumbs.append(BreadcrumbItem(id=current.id, name=current.name))
        current = current.parent
    crumbs.reverse()
    return crumbs


# ── List root folders ───────────────────────────────────────────────────

@router.get("/", response_model=List[FolderResponse])
async def list_root_folders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all root-level folders for the authenticated user."""
    folders = (
        db.query(Folder)
        .filter(Folder.user_id == user.id, Folder.parent_id.is_(None), Folder.deleted_at.is_(None))
        .order_by(Folder.name)
        .all()
    )
    return [_folder_response(f) for f in folders]


# ── Get folder contents ─────────────────────────────────────────────────

@router.get("/{folder_id}", response_model=FolderContents)
async def get_folder_contents(
    folder_id: str,
    response: Response,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the contents of a folder: its subfolders, paginated images,
    and the breadcrumb trail from root to this folder.
    """
    folder = (
        db.query(Folder)
        .filter(Folder.id == folder_id, Folder.user_id == user.id, Folder.deleted_at.is_(None))
        .first()
    )
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found.",
        )

    # Cache metadata for 15 seconds to reduce repeated network requests
    response.headers["Cache-Control"] = "private, max-age=15, must-revalidate"

    # Sub-folders
    subfolders = (
        db.query(Folder)
        .filter(Folder.parent_id == folder.id, Folder.deleted_at.is_(None))
        .order_by(Folder.name)
        .all()
    )

    # Paginated images
    total = db.query(Image).filter(Image.folder_id == folder.id, Image.deleted_at.is_(None)).count()
    total_pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    images = (
        db.query(Image)
        .filter(Image.folder_id == folder.id, Image.deleted_at.is_(None))
        .order_by(Image.uploaded_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )

    return FolderContents(
        folder=_folder_response(folder),
        subfolders=[_folder_response(sf) for sf in subfolders],
        images=PaginatedImages(
            items=[ImageResponse.model_validate(img) for img in images],
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        ),
        breadcrumbs=_build_breadcrumbs(folder),
    )


# ── Create folder ───────────────────────────────────────────────────────

@router.post("/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: FolderCreate,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """
    Create a new folder. If parent_id is provided the folder is nested
    inside the parent; otherwise it becomes a root folder.

    A `.gitkeep` file is created inside the folder on GitHub so that the
    empty directory is persisted.
    """
    if not user.repository_name or not user.repository_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No repository selected. Complete setup first.",
        )

    try:
        name = validate_folder_name(body.name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # Resolve parent path
    parent_path = ""
    if body.parent_id:
        parent = (
            db.query(Folder)
            .filter(Folder.id == body.parent_id, Folder.user_id == user.id, Folder.deleted_at.is_(None))
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent folder not found.",
            )
        parent_path = parent.github_path

    github_path = f"{parent_path}/{name}" if parent_path else name

    # Check for duplicate folder name at same level
    existing = (
        db.query(Folder)
        .filter(
            Folder.user_id == user.id,
            Folder.parent_id == body.parent_id,
            Folder.name == name,
            Folder.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Folder '{name}' already exists at this level.",
        )

    # Create .gitkeep on GitHub so the folder exists
    try:
        await StorageService.upload_file(
            token=token,
            owner=user.repository_owner,
            repo=user.repository_name,
            path=f"{github_path}/.gitkeep",
            content_bytes=b"",
            message=f"Create folder: {github_path}",
        )
    except Exception as exc:
        logger.error("StorageService create folder failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create folder on GitHub.",
        )

    folder = Folder(
        name=name,
        parent_id=body.parent_id,
        user_id=user.id,
        github_path=github_path,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    # Audit log
    log_activity(db, user.id, "create_folder", {"folder_id": folder.id, "name": folder.name, "github_path": github_path})

    return _folder_response(folder)


# ── Rename folder ───────────────────────────────────────────────────────

@router.put("/{folder_id}/rename", response_model=FolderResponse)
async def rename_folder(
    folder_id: str,
    body: FolderRename,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename a folder (local DB only — GitHub paths stay the same)."""
    folder = (
        db.query(Folder)
        .filter(Folder.id == folder_id, Folder.user_id == user.id, Folder.deleted_at.is_(None))
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found.")

    try:
        name = validate_folder_name(body.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Check duplicate at same level
    dup = (
        db.query(Folder)
        .filter(
            Folder.user_id == user.id,
            Folder.parent_id == folder.parent_id,
            Folder.name == name,
            Folder.id != folder.id,
            Folder.deleted_at.is_(None),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail=f"Folder '{name}' already exists.")

    old_name = folder.name
    folder.name = name
    db.commit()
    db.refresh(folder)

    # Audit log
    log_activity(db, user.id, "rename_folder", {"folder_id": folder.id, "old_name": old_name, "new_name": name})

    return _folder_response(folder)


# ── Delete folder ───────────────────────────────────────────────────────

@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Soft-delete a folder and all its nested subfolders and images.
    """
    folder = (
        db.query(Folder)
        .filter(Folder.id == folder_id, Folder.user_id == user.id, Folder.deleted_at.is_(None))
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found.")

    now = datetime.now(timezone.utc)
    _soft_delete_folder_recursive(folder, now)
    db.commit()

    # Audit log
    log_activity(db, user.id, "delete_folder", {"folder_id": folder.id, "name": folder.name})


def _soft_delete_folder_recursive(folder: Folder, now: datetime) -> None:
    """Recursively set deleted_at on the folder and all its contents."""
    folder.deleted_at = now
    for image in folder.images:
        image.deleted_at = now
    for child in folder.children:
        _soft_delete_folder_recursive(child, now)

