"""
Pydantic schemas for request / response serialisation.

All schemas use model_config with from_attributes=True so they can be
built directly from SQLAlchemy model instances.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── User ────────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    """Public-facing user representation (never exposes the token)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    github_id: Optional[int] = None
    username: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    repository_name: Optional[str] = None
    repository_owner: Optional[str] = None


# ── Breadcrumbs ─────────────────────────────────────────────────────────

class BreadcrumbItem(BaseModel):
    """Single entry in a folder breadcrumb trail."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


# ── Folder ──────────────────────────────────────────────────────────────

class FolderCreate(BaseModel):
    """Payload for creating a new folder."""

    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[str] = None


class FolderRename(BaseModel):
    """Payload for renaming an existing folder."""

    name: str = Field(..., min_length=1, max_length=255)


class FolderResponse(BaseModel):
    """Folder metadata returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    parent_id: Optional[str] = None
    github_path: str
    created_at: datetime
    subfolder_count: int = 0
    image_count: int = 0


class DeleteFolderRequest(BaseModel):
    """Options when deleting a folder."""

    delete_contents: bool = True


# ── Image ───────────────────────────────────────────────────────────────

class ImageResponse(BaseModel):
    """Image / video metadata returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    folder_id: Optional[str] = None
    github_path: str
    size: int
    mime_type: str
    thumbnail_path: Optional[str] = None
    uploaded_at: datetime


class ImageRename(BaseModel):
    """Payload for renaming an image file."""

    filename: str = Field(..., min_length=1, max_length=255)


class PaginatedImages(BaseModel):
    """Paginated list of images with metadata."""

    items: List[ImageResponse]
    page: int
    per_page: int
    total: int
    total_pages: int


# ── Folder Contents (combined response) ────────────────────────────────

class FolderContents(BaseModel):
    """
    Full representation of a folder's contents:
    the folder itself, its subfolders, paginated images, and breadcrumbs.
    """

    folder: FolderResponse
    subfolders: List[FolderResponse]
    images: PaginatedImages
    breadcrumbs: List[BreadcrumbItem]


# ── Repository ──────────────────────────────────────────────────────────

class RepoCreate(BaseModel):
    """Payload for creating a new GitHub repository."""

    name: str = Field(..., min_length=1, max_length=100)


class RepoSelect(BaseModel):
    """Payload for selecting an existing GitHub repository."""

    repo_name: str
    repo_owner: str


class RepoInfo(BaseModel):
    """GitHub repository info returned to the client."""

    id: int
    name: str
    full_name: str
    private: bool
    owner: str


# ── Custom Auth ──────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    """Payload for username and password registration."""

    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    email: Optional[str] = None


class UserLoginPass(BaseModel):
    """Payload for username and password login."""

    username: str
    password: str


class TokenLink(BaseModel):
    """Payload to link a GitHub Personal Access Token to a user."""

    token: str = Field(..., min_length=1)


# ── Activity & Trash ──────────────────────────────────────────────────

class ActivityLogResponse(BaseModel):
    """Activity log schema returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    action: str
    details: Optional[str] = None
    created_at: datetime


class TrashContents(BaseModel):
    """Lists of deleted folders and images in Trash."""

    folders: List[FolderResponse]
    images: List[ImageResponse]


# ── Chunked Uploads ─────────────────────────────────────────────────────

class UploadInitiateRequest(BaseModel):
    filename: str
    folder_id: str
    total_size: int
    mime_type: str
    upload_id: Optional[str] = None


class UploadInitiateResponse(BaseModel):
    upload_id: str
    chunk_size: int
    uploaded_chunks: List[int]


class UploadCompleteRequest(BaseModel):
    upload_id: str



