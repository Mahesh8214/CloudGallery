"""
Thumbnail generation service.

Generates JPEG thumbnails for images (JPEG, PNG, WebP) using Pillow,
and optionally extracts the first frame of MP4 videos via ffmpeg.
"""

import io
import logging
import subprocess
import tempfile
from typing import Optional, Tuple

from PIL import Image, ImageOps

from app.config import settings

logger = logging.getLogger(__name__)


def generate_thumbnail(
    file_bytes: bytes,
    mime_type: str,
    size: Tuple[int, int] | None = None,
) -> Optional[bytes]:
    """
    Generate a JPEG thumbnail from the given file bytes.

    Parameters
    ----------
    file_bytes : bytes
        Raw file content.
    mime_type : str
        MIME type of the source file (e.g. "image/jpeg", "video/mp4").
    size : tuple[int, int] | None
        Target thumbnail dimensions (width, height).  Falls back to
        ``settings.THUMBNAIL_SIZE`` if not provided.

    Returns
    -------
    bytes | None
        JPEG-encoded thumbnail bytes, or None if generation failed
        (e.g. unsupported format, ffmpeg not available).
    """
    if size is None:
        size = settings.THUMBNAIL_SIZE

    if mime_type.startswith("image/"):
        return _thumbnail_from_image(file_bytes, size)
    elif mime_type == "video/mp4":
        return _thumbnail_from_video(file_bytes, size)
    else:
        logger.debug("Unsupported MIME type for thumbnailing: %s", mime_type)
        return None


def _thumbnail_from_image(
    file_bytes: bytes,
    size: Tuple[int, int],
) -> Optional[bytes]:
    """
    Resize an image to fit within *size* while preserving aspect ratio,
    then return JPEG bytes.
    """
    try:
        img = Image.open(io.BytesIO(file_bytes))

        # Handle EXIF orientation so thumbnails aren't rotated
        img = ImageOps.exif_transpose(img)

        # Convert to RGB (handles RGBA / palette images)
        if img.mode not in ("RGB",):
            img = img.convert("RGB")

        img.thumbnail(size, Image.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85, optimize=True)
        return buffer.getvalue()
    except Exception:
        logger.exception("Failed to generate image thumbnail")
        return None


def _thumbnail_from_video(
    file_bytes: bytes,
    size: Tuple[int, int],
) -> Optional[bytes]:
    """
    Extract the first frame of an MP4 video using ffmpeg, then resize
    it to a JPEG thumbnail.

    Returns None if ffmpeg is not installed or the extraction fails.
    """
    try:
        # Write the video to a temp file (ffmpeg needs a seekable file)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_video:
            tmp_video.write(file_bytes)
            tmp_video_path = tmp_video.name

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_frame:
            tmp_frame_path = tmp_frame.name

        # Extract the first frame using ffmpeg
        cmd = [
            "ffmpeg",
            "-y",                   # overwrite output
            "-i", tmp_video_path,   # input
            "-vframes", "1",        # one frame
            "-q:v", "2",            # quality
            tmp_frame_path,         # output
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            logger.warning("ffmpeg exited with code %d: %s", result.returncode, result.stderr[:500])
            return None

        # Read the extracted frame and resize
        with open(tmp_frame_path, "rb") as f:
            frame_bytes = f.read()

        return _thumbnail_from_image(frame_bytes, size)

    except FileNotFoundError:
        logger.info("ffmpeg not found – video thumbnails will not be generated.")
        return None
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg timed out while extracting video frame.")
        return None
    except Exception:
        logger.exception("Failed to generate video thumbnail")
        return None
    finally:
        # Clean up temp files
        import os
        for path in (tmp_video_path, tmp_frame_path):
            try:
                os.unlink(path)
            except (OSError, UnboundLocalError):
                pass
