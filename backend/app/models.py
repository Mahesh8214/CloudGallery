"""
SQLAlchemy ORM models for the Personal Cloud Gallery.

Three core entities:
  • User  – GitHub-authenticated user with encrypted access token.
  • Folder – Hierarchical folder structure mirrored on the GitHub repo.
  • Image  – Media file metadata with a reference to its GitHub blob.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    BigInteger,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class User(Base):
    """
    Represents a GitHub-authenticated user.

    The access_token_encrypted field stores the Fernet-encrypted GitHub
    personal access token so it is never held in plaintext at rest.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    github_id: Mapped[Optional[int]] = mapped_column(Integer, unique=True, nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    access_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Selected repository for storing gallery media
    repository_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    repository_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    repository_owner: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # Relationships
    folders: Mapped[List["Folder"]] = relationship(
        "Folder", back_populates="user", cascade="all, delete-orphan"
    )
    images: Mapped[List["Image"]] = relationship(
        "Image", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"


class Folder(Base):
    """
    A folder in the gallery. Supports unlimited nesting via self-referential
    parent_id foreign key. Using UUID strings internally.
    """

    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    github_path: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Self-referential relationship for nested folders
    parent: Mapped[Optional["Folder"]] = relationship(
        "Folder",
        remote_side="Folder.id",
        back_populates="children",
    )
    children: Mapped[List["Folder"]] = relationship(
        "Folder",
        back_populates="parent",
        cascade="all, delete-orphan",
    )

    # Folder → Images
    images: Mapped[List["Image"]] = relationship(
        "Image", back_populates="folder", cascade="all, delete-orphan"
    )

    # Folder → User
    user: Mapped["User"] = relationship("User", back_populates="folders")

    def __repr__(self) -> str:
        return f"<Folder id={self.id} name={self.name!r} path={self.github_path!r}>"


class Image(Base):
    """
    Metadata for a media file (image or video) stored on GitHub.
    Uses UUID strings internally.
    """

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    folder_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    github_path: Mapped[str] = mapped_column(Text, nullable=False)
    github_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Relationships
    folder: Mapped[Optional["Folder"]] = relationship("Folder", back_populates="images")
    user: Mapped["User"] = relationship("User", back_populates="images")

    def __repr__(self) -> str:
        return f"<Image id={self.id} filename={self.filename!r}>"


class ActivityLog(Base):
    """
    Structured activity/audit logs for trackable user actions.
    """

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., upload, download, delete, move, rename, login, error
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON or description
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<ActivityLog id={self.id} action={self.action!r} user_id={self.user_id}>"

