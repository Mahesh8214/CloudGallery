"""
Personal Cloud Gallery — FastAPI application entry point.

Creates the app instance, registers routers, configures CORS,
and runs database table creation on startup.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.routers import auth, folders, images, repos, trash, activity

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Background Trash Cleanup ───────────────────────────────────────────
_CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60  # 24 hours

async def _periodic_trash_cleanup():
    """Background task that permanently deletes items soft-deleted > 30 days ago."""
    while True:
        await asyncio.sleep(_CLEANUP_INTERVAL_SECONDS)
        logger.info("Running periodic trash cleanup…")
        try:
            from app.models import Folder, Image
            db = SessionLocal()
            threshold = datetime.now(timezone.utc) - timedelta(days=30)

            expired_images = db.query(Image).filter(
                Image.deleted_at.isnot(None),
                Image.deleted_at < threshold
            ).all()

            expired_folders = db.query(Folder).filter(
                Folder.deleted_at.isnot(None),
                Folder.deleted_at < threshold
            ).all()

            count_images = len(expired_images)
            count_folders = len(expired_folders)

            for img in expired_images:
                db.delete(img)
            for fold in expired_folders:
                db.delete(fold)

            if count_images or count_folders:
                db.commit()
                logger.info(
                    "Periodic cleanup: removed %d expired images, %d expired folders from DB.",
                    count_images, count_folders,
                )
            else:
                logger.info("Periodic cleanup: no expired items found.")

            db.close()
        except Exception:
            logger.exception("Periodic trash cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup and launch background workers."""
    logger.info("Creating database tables …")
    Base.metadata.create_all(bind=engine)
    
    # Run SQLite migration for password_hash column if not exists
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL;"))
            logger.info("Database migration: password_hash column added to users table.")
    except Exception:
        # If it already exists, SQLite will throw an error, which we safely ignore
        pass
        
    logger.info("Database ready.")

    # Launch periodic background trash cleanup
    cleanup_task = asyncio.create_task(_periodic_trash_cleanup())
    logger.info("Background trash cleanup task scheduled (every 24h).")

    yield

    # Cancel background task on shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="CloudGallery API",
    description="Personal photo vault powered by GitHub",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/auth")
app.include_router(repos.router, prefix="/api/repos")
app.include_router(folders.router, prefix="/api/folders")
app.include_router(images.router, prefix="/api/images")
app.include_router(trash.router, prefix="/api/trash")
app.include_router(activity.router, prefix="/api/activity")


# ── Health check ────────────────────────────────────────────────────────
import httpx
from sqlalchemy import text

@app.get("/health")
@app.get("/api/health")
async def health():
    # 1. Database Check
    db_status = "healthy"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    # 2. Storage Check (GitHub Connectivity)
    storage_status = "healthy"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.get("https://api.github.com/")
            if res.status_code != 200:
                storage_status = f"unhealthy: status code {res.status_code}"
    except Exception as e:
        storage_status = f"unhealthy: {str(e)}"

    overall_status = "healthy" if db_status == "healthy" and storage_status == "healthy" else "unhealthy"

    return {
        "status": overall_status,
        "database": db_status,
        "storage": storage_status,
        "app": "healthy"
    }

