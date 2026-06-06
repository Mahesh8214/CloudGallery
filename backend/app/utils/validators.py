"""
Input validation and sanitisation utilities for file and folder names.

These pure functions have no side effects and are safe to call from any
context (sync or async).
"""

import os
import re
from typing import List

from app.config import settings

# Map file extensions to MIME types
_EXTENSION_MIME_MAP = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "mp4": "video/mp4",
}


def validate_file_type(filename: str, content_type: str | None = None) -> bool:
    """
    Check whether the file extension is in the allowed list.

    Parameters
    ----------
    filename : str
        The original filename (e.g. "photo.jpg").
    content_type : str | None
        Optional MIME type header value for additional checking.

    Returns
    -------
    bool
        True if the extension is allowed.
    """
    ext = _get_extension(filename)
    if ext not in settings.ALLOWED_EXTENSIONS:
        return False

    # If content_type was provided, cross-check with extension
    if content_type:
        expected_mime = _EXTENSION_MIME_MAP.get(ext)
        if expected_mime and content_type != expected_mime:
            # Be lenient – some clients send generic types
            if content_type not in (
                "application/octet-stream",
                "binary/octet-stream",
            ):
                return False

    return True


def validate_file_size(size: int) -> bool:
    """
    Check whether the file size is within the configured maximum.

    Parameters
    ----------
    size : int
        File size in bytes.

    Returns
    -------
    bool
        True if the file is within the limit.
    """
    return 0 < size <= settings.MAX_FILE_SIZE


def sanitize_filename(filename: str) -> str:
    """
    Remove dangerous characters from a filename while preserving the
    extension.

    Rules applied:
      - Strip leading/trailing whitespace.
      - Remove path separators (/, \\\\).
      - Remove null bytes.
      - Replace sequences of dots (except the extension separator).
      - Collapse multiple spaces/underscores.

    Parameters
    ----------
    filename : str
        Raw filename from the upload.

    Returns
    -------
    str
        Sanitised filename.
    """
    # Strip whitespace
    filename = filename.strip()

    # Remove path separators and null bytes
    filename = filename.replace("/", "").replace("\\", "").replace("\x00", "")

    # Split into name and extension
    name, ext = os.path.splitext(filename)

    # Remove leading dots from name (hidden files on Unix)
    name = name.lstrip(".")

    # Replace dangerous characters (keep alphanumeric, dash, underscore, space, dot)
    name = re.sub(r"[^\w\s\-.]", "", name)

    # Collapse whitespace and underscores
    name = re.sub(r"[\s_]+", "_", name).strip("_")

    # Fallback for empty name
    if not name:
        name = "unnamed"

    return f"{name}{ext.lower()}"


def validate_folder_name(name: str) -> str:
    """
    Validate and clean a folder name.

    Raises
    ------
    ValueError
        If the name is empty or contains illegal characters.

    Returns
    -------
    str
        The validated (and trimmed) folder name.
    """
    # Strip whitespace
    name = name.strip()

    if not name:
        raise ValueError("Folder name cannot be empty.")

    if len(name) > 255:
        raise ValueError("Folder name must be 255 characters or fewer.")

    # Reject path traversal attempts
    if ".." in name:
        raise ValueError("Folder name must not contain '..'.")

    # Reject path separators
    if "/" in name or "\\" in name:
        raise ValueError("Folder name must not contain '/' or '\\\\'.")

    # Reject leading/trailing dots
    if name.startswith(".") or name.endswith("."):
        raise ValueError("Folder name must not start or end with '.'.")

    # Remove any remaining dangerous chars but keep spaces, dashes, underscores
    cleaned = re.sub(r"[^\w\s\-.]", "", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if not cleaned:
        raise ValueError("Folder name contains only invalid characters.")

    return cleaned


def generate_unique_filename(filename: str, existing_names: List[str]) -> str:
    """
    Append a numeric suffix to avoid collisions with existing names.

    Examples
    --------
    >>> generate_unique_filename("photo.jpg", ["photo.jpg"])
    'photo (1).jpg'
    >>> generate_unique_filename("photo.jpg", ["photo.jpg", "photo (1).jpg"])
    'photo (2).jpg'

    Parameters
    ----------
    filename : str
        Desired filename.
    existing_names : list[str]
        List of filenames already present in the target folder.

    Returns
    -------
    str
        A filename guaranteed not to collide with existing_names.
    """
    if filename not in existing_names:
        return filename

    name, ext = os.path.splitext(filename)
    counter = 1
    while True:
        candidate = f"{name} ({counter}){ext}"
        if candidate not in existing_names:
            return candidate
        counter += 1


def get_mime_type(filename: str) -> str:
    """
    Derive MIME type from the file extension.

    Returns ``application/octet-stream`` for unrecognised extensions.
    """
    ext = _get_extension(filename)
    return _EXTENSION_MIME_MAP.get(ext, "application/octet-stream")


# ── Private helpers ─────────────────────────────────────────────────────

def _get_extension(filename: str) -> str:
    """Return the lowercase extension without the leading dot."""
    _, ext = os.path.splitext(filename)
    return ext.lstrip(".").lower()
