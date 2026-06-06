"""
Application configuration using Pydantic BaseSettings.

All settings can be overridden via environment variables or a .env file.
Sensitive values like GITHUB_CLIENT_SECRET, SECRET_KEY, and ENCRYPTION_KEY
should always be set via environment variables in production.
"""

import secrets
from typing import List, Tuple

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration for the Personal Cloud Gallery backend.

    Reads values from environment variables and .env file.
    Generates cryptographically secure defaults for SECRET_KEY and
    ENCRYPTION_KEY if not provided (useful for development).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── GitHub OAuth ────────────────────────────────────────────────
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"

    # ── Security ────────────────────────────────────────────────────
    SECRET_KEY: str = secrets.token_urlsafe(64)
    ENCRYPTION_KEY: str = ""  # Fernet key – generated at startup if blank

    # ── Database ────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./data/gallery.db"

    # ── Frontend ────────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"

    # ── File Upload Constraints ─────────────────────────────────────
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100 MB
    THUMBNAIL_SIZE: Tuple[int, int] = (300, 300)
    ALLOWED_EXTENSIONS: List[str] = ["jpg", "jpeg", "png", "webp", "mp4"]

    # ── JWT ──────────────────────────────────────────────────────────
    JWT_EXPIRY_HOURS: int = 168  # 7 days
    JWT_ALGORITHM: str = "HS256"

    def model_post_init(self, __context) -> None:
        """Validate required configuration settings."""
        if not self.GITHUB_CLIENT_ID:
            raise ValueError("Configuration error: GITHUB_CLIENT_ID is required and cannot be empty.")
        if not self.GITHUB_CLIENT_SECRET:
            raise ValueError("Configuration error: GITHUB_CLIENT_SECRET is required and cannot be empty.")
        if not self.DATABASE_URL:
            raise ValueError("Configuration error: DATABASE_URL is required and cannot be empty.")
        if not (
            self.DATABASE_URL.startswith("sqlite://")
            or self.DATABASE_URL.startswith("postgresql://")
            or self.DATABASE_URL.startswith("postgres://")
        ):
            raise ValueError("Configuration error: DATABASE_URL must be a valid SQLite or PostgreSQL URI.")
        if not self.SECRET_KEY:
            raise ValueError("Configuration error: SECRET_KEY is required.")


# Singleton settings instance used across the application.
settings = Settings()

