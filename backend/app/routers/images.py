"""
Image management router.

Endpoints:
  POST   /api/images/upload          → Upload a file to GitHub + store metadata.
  GET    /api/images/{id}            → Get image metadata.
  GET    /api/images/{id}/view       → Stream raw image bytes from GitHub.
  GET    /api/images/{id}/thumbnail  → Serve pre-generated thumbnail.
  PUT    /api/images/{id}/rename     → Rename an image (updates GitHub and DB).
  DELETE /api/images/{id}            → Soft delete image.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_github_token
from app.models import Folder, Image, User
from app.schemas import ImageRename, ImageResponse, PaginatedImages
from app.services.github import GitHubService, GitHubServiceError
from app.services.storage import StorageService
from app.services.thumbnail import generate_thumbnail
from app.services.activity import log_activity
from app.utils.validators import (
    get_mime_type,
    sanitize_filename,
    validate_file_size,
    validate_file_type,
    generate_unique_filename,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["images"])


# ── Upload ──────────────────────────────────────────────────────────────

@router.post("/upload", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    response: Response,
    file: UploadFile = File(...),
    folder_id: str = Form(...),
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """
    Upload a file to the user's GitHub repository.

    1. Validate file type and size.
    2. Read file bytes.
    3. Push to GitHub via Contents API.
    4. Generate a thumbnail.
    5. Store metadata in the database.
    """
    if not user.repository_name or not user.repository_owner:
        raise HTTPException(status_code=400, detail="No repository selected.")

    # Validate file type
    if not validate_file_type(file.filename or "unknown", file.content_type):
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    # Read bytes
    content = await file.read()

    # Validate size
    if not validate_file_size(len(content)):
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is 100 MB.",
        )

    # Resolve folder
    folder = (
        db.query(Folder)
        .filter(Folder.id == folder_id, Folder.user_id == user.id, Folder.deleted_at.is_(None))
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found.")

    # Sanitize filename and ensure uniqueness
    filename = sanitize_filename(file.filename or "unnamed")
    existing_names = [img.filename for img in folder.images if img.deleted_at is None]
    filename = generate_unique_filename(filename, existing_names)

    github_path = f"{folder.github_path}/{filename}"
    mime_type = get_mime_type(filename)

    # Generate thumbnail bytes
    thumb_bytes = generate_thumbnail(content, mime_type)

    async def db_insert_func(uploaded_sha: str, path: str) -> Image:
        thumbnail_path = None
        if thumb_bytes:
            # Upload thumbnail next to the original file
            name_parts = filename.rsplit(".", 1)
            thumb_filename = f"{name_parts[0]}_thumbnail.jpg"
            thumb_path = f"{folder.github_path}/{thumb_filename}"
            try:
                await StorageService.upload_file(
                    token=token,
                    owner=user.repository_owner,
                    repo=user.repository_name,
                    path=thumb_path,
                    content_bytes=thumb_bytes,
                    message=f"Upload thumbnail for {filename}"
                )
                thumbnail_path = thumb_path
            except Exception as e:
                logger.error("Failed to upload thumbnail to GitHub: %s", e)

        new_image = Image(
            filename=filename,
            folder_id=folder_id,
            user_id=user.id,
            github_path=path,
            github_sha=uploaded_sha,
            size=len(content),
            mime_type=mime_type,
            thumbnail_path=thumbnail_path
        )
        db.add(new_image)
        return new_image

    try:
        image = await StorageService.execute_transactional_upload(
            db=db,
            token=token,
            owner=user.repository_owner,
            repo=user.repository_name,
            path=github_path,
            content_bytes=content,
            message=f"Upload: {github_path}",
            db_insert_func=db_insert_func
        )
    except Exception as exc:
        logger.error("Transactional upload failed: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to upload image metadata.")

    # Audit log
    log_activity(db, user.id, "upload_image", {"image_id": image.id, "filename": filename, "path": github_path})

    return image


# ── Search ──────────────────────────────────────────────────────────────

@router.get("/search", response_model=PaginatedImages)
async def search_images(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Search images by filename using indexed partial matching.
    """
    query_filter = db.query(Image).filter(
        Image.user_id == user.id,
        Image.deleted_at.is_(None),
        Image.filename.ilike(f"%{q}%")
    )
    
    total = query_filter.count()
    total_pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    
    images = (
        query_filter.order_by(Image.uploaded_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    
    return PaginatedImages(
        items=[ImageResponse.model_validate(img) for img in images],
        page=page,
        per_page=per_page,
        total=total,
        total_pages=total_pages
    )


# ── Get metadata ────────────────────────────────────────────────────────

@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(
    image_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return metadata for a single image."""
    image = (
        db.query(Image)
        .filter(Image.id == image_id, Image.user_id == user.id, Image.deleted_at.is_(None))
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")

    response.headers["Cache-Control"] = "private, max-age=15, must-revalidate"
    return image


# ── View / download ────────────────────────────────────────────────────

@router.get("/{image_id}/view")
async def view_image(
    image_id: str,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """Stream the raw file bytes from GitHub (proxy download)."""
    image = (
        db.query(Image)
        .filter(Image.id == image_id, Image.user_id == user.id, Image.deleted_at.is_(None))
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")

    try:
        file_bytes = await GitHubService.download_file(
            token=token,
            owner=user.repository_owner,
            repo=user.repository_name,
            path=image.github_path,
        )
    except GitHubServiceError as exc:
        logger.error("Download failed: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to download from GitHub.")

    # Audit log (down-prioritized to debug level to prevent log pollution, but logged)
    logger.debug("User %s downloaded/viewed %s", user.id, image.github_path)

    return Response(
        content=file_bytes,
        media_type=image.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{image.filename}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


# ── Thumbnail ──────────────────────────────────────────────────────────

@router.get("/{image_id}/thumbnail")
async def get_thumbnail(
    image_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """
    Return a JPEG thumbnail for the image. Pre-generated and served from GitHub.
    """
    image = (
        db.query(Image)
        .filter(Image.id == image_id, Image.user_id == user.id, Image.deleted_at.is_(None))
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")

    # Return public, max-age caching headers for browser efficiency
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"

    # If we have the pre-generated thumbnail path, download and serve it
    if image.thumbnail_path:
        try:
            thumb_bytes = await GitHubService.download_file(
                token=token,
                owner=user.repository_owner,
                repo=user.repository_name,
                path=image.thumbnail_path,
            )
            return Response(content=thumb_bytes, media_type="image/jpeg")
        except Exception as e:
            logger.warning("Failed to fetch pre-generated thumbnail %s from GitHub: %s. Regenerating...", image.thumbnail_path, e)

    # Fallback: download and generate on-the-fly, and upload for future requests
    try:
        file_bytes = await GitHubService.download_file(
            token=token,
            owner=user.repository_owner,
            repo=user.repository_name,
            path=image.github_path,
        )
    except GitHubServiceError:
        raise HTTPException(status_code=502, detail="Failed to fetch original file from GitHub.")

    thumb_bytes = generate_thumbnail(file_bytes, image.mime_type)
    if not thumb_bytes:
        raise HTTPException(status_code=404, detail="Cannot generate thumbnail.")

    # Asynchronously upload back to GitHub and update DB so subsequent loads are fast
    name_parts = image.filename.rsplit(".", 1)
    thumb_filename = f"{name_parts[0]}_thumbnail.jpg"
    folder = image.folder
    if folder:
        thumb_path = f"{folder.github_path}/{thumb_filename}"
        try:
            await StorageService.upload_file(
                token=token,
                owner=user.repository_owner,
                repo=user.repository_name,
                path=thumb_path,
                content_bytes=thumb_bytes,
                message=f"Upload fallback thumbnail for {image.filename}"
            )
            image.thumbnail_path = thumb_path
            db.commit()
        except Exception as upload_err:
            logger.error("Failed to upload fallback thumbnail to GitHub: %s", upload_err)

    return Response(content=thumb_bytes, media_type="image/jpeg")


# ── Rename ─────────────────────────────────────────────────────────────

@router.put("/{image_id}/rename", response_model=ImageResponse)
async def rename_image(
    image_id: str,
    body: ImageRename,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """Rename an image (updates GitHub and DB)."""
    image = (
        db.query(Image)
        .filter(Image.id == image_id, Image.user_id == user.id, Image.deleted_at.is_(None))
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")

    new_filename = sanitize_filename(body.filename)
    if not validate_file_type(new_filename):
        raise HTTPException(status_code=400, detail="Invalid file extension.")

    # Check for duplicate in same folder
    folder = image.folder
    if folder:
        existing_names = [img.filename for img in folder.images if img.deleted_at is None and img.id != image.id]
        if new_filename in existing_names:
            raise HTTPException(status_code=409, detail=f"File '{new_filename}' already exists in this folder.")

    # Prepare new paths
    parent_path = folder.github_path if folder else ""
    new_path = f"{parent_path}/{new_filename}" if parent_path else new_filename

    # Rename original file on GitHub using StorageService (rename is copy + delete)
    try:
        await StorageService.rename_or_move_file(
            token=token,
            owner=user.repository_owner,
            repo=user.repository_name,
            old_path=image.github_path,
            new_path=new_path,
            sha=image.github_sha,
            message=f"Rename: {image.github_path} to {new_path}"
        )
    except Exception as exc:
        logger.error("GitHub rename failed: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to rename file on GitHub.")

    # If original rename succeeds, try to rename thumbnail as well
    new_thumb_path = None
    if image.thumbnail_path:
        name_parts = new_filename.rsplit(".", 1)
        new_thumb_filename = f"{name_parts[0]}_thumbnail.jpg"
        new_thumb_path = f"{parent_path}/{new_thumb_filename}" if parent_path else new_thumb_filename
        try:
            thumb_info = await GitHubService.get_file_content(
                token=token,
                owner=user.repository_owner,
                repo=user.repository_name,
                path=image.thumbnail_path
            )
            await StorageService.rename_or_move_file(
                token=token,
                owner=user.repository_owner,
                repo=user.repository_name,
                old_path=image.thumbnail_path,
                new_path=new_thumb_path,
                sha=thumb_info["sha"],
                message=f"Rename thumbnail: {image.thumbnail_path} to {new_thumb_path}"
            )
        except Exception as e:
            logger.warning("Failed to rename thumbnail on GitHub: %s", e)
            new_thumb_path = image.thumbnail_path

    # Get updated SHA for the new file path from GitHub
    try:
        new_file_info = await GitHubService.get_file_content(
            token=token,
            owner=user.repository_owner,
            repo=user.repository_name,
            path=new_path
        )
        image.github_sha = new_file_info["sha"]
    except Exception as sha_err:
        logger.warning("Failed to fetch new file SHA from GitHub: %s", sha_err)

    old_filename = image.filename
    image.filename = new_filename
    image.github_path = new_path
    if new_thumb_path:
        image.thumbnail_path = new_thumb_path

    db.commit()
    db.refresh(image)

    # Audit log
    log_activity(db, user.id, "rename_image", {"image_id": image.id, "old_filename": old_filename, "new_filename": new_filename})

    return image


# ── Delete ─────────────────────────────────────────────────────────────

@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete an image."""
    image = (
        db.query(Image)
        .filter(Image.id == image_id, Image.user_id == user.id, Image.deleted_at.is_(None))
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")

    image.deleted_at = datetime.now(timezone.utc)
    db.commit()

    # Audit log
    log_activity(db, user.id, "delete_image", {"image_id": image.id, "filename": image.filename})

