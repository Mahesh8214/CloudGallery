import logging
import asyncio
from typing import Any, Dict, Optional, Callable, Awaitable
from sqlalchemy.orm import Session
from app.services.github import GitHubService, GitHubServiceError

logger = logging.getLogger(__name__)

class StorageService:
    """
    Storage Service Layer acting as an abstraction over the raw GitHub Service.
    Implements retries, logging, and transaction-safety logic to sync Database and GitHub states.
    """

    @classmethod
    async def upload_file(
        cls,
        token: str,
        owner: str,
        repo: str,
        path: str,
        content_bytes: bytes,
        message: str,
        sha: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Uploads a file to GitHub with automatic retry logic.
        """
        logger.info("Uploading file to GitHub: %s", path)
        return await GitHubService.create_or_update_file(
            token=token,
            owner=owner,
            repo=repo,
            path=path,
            content_bytes=content_bytes,
            message=message,
            sha=sha
        )

    @classmethod
    async def delete_file(
        cls,
        token: str,
        owner: str,
        repo: str,
        path: str,
        sha: str,
        message: str,
    ) -> Dict[str, Any]:
        """
        Deletes a file from GitHub with automatic retry logic.
        """
        logger.info("Deleting file from GitHub: %s", path)
        return await GitHubService.delete_file(
            token=token,
            owner=owner,
            repo=repo,
            path=path,
            sha=sha,
            message=message
        )

    @classmethod
    async def rename_or_move_file(
        cls,
        token: str,
        owner: str,
        repo: str,
        old_path: str,
        new_path: str,
        sha: str,
        message: str,
    ) -> Dict[str, Any]:
        """
        Renames or moves a file on GitHub.
        GitHub doesn't support direct renames, so this downloads/reads the file content,
        creates the file at the new path, and deletes the old path.
        Returns the response dict of the newly created file.
        """
        logger.info("Renaming/moving file on GitHub from %s to %s", old_path, new_path)
        
        # 1. Download file content
        content_bytes = await GitHubService.download_file(
            token=token,
            owner=owner,
            repo=repo,
            path=old_path
        )
        
        # 2. Upload to new path
        new_file_res = await GitHubService.create_or_update_file(
            token=token,
            owner=owner,
            repo=repo,
            path=new_path,
            content_bytes=content_bytes,
            message=f"Move source to {new_path}"
        )
        
        # 3. Delete old path
        try:
            await GitHubService.delete_file(
                token=token,
                owner=owner,
                repo=repo,
                path=old_path,
                sha=sha,
                message=message
            )
        except Exception as e:
            logger.error("Failed to delete old file path %s after moving. Cleaning up new file %s...", old_path, new_path, exc_info=True)
            # Rollback: delete the new file
            new_sha = new_file_res.get("content", {}).get("sha")
            if new_sha:
                try:
                    await GitHubService.delete_file(
                        token=token,
                        owner=owner,
                        repo=repo,
                        path=new_path,
                        sha=new_sha,
                        message="Rollback move operation"
                    )
                except Exception as rollback_err:
                    logger.error("Failed to delete new file %s during rollback: %s", new_path, rollback_err)
            raise e

        return new_file_res

    @classmethod
    async def execute_transactional_upload(
        cls,
        db: Session,
        token: str,
        owner: str,
        repo: str,
        path: str,
        content_bytes: bytes,
        message: str,
        db_insert_func: Callable[[str, str], Awaitable[Any]],
        sha: Optional[str] = None,
    ) -> Any:
        """
        Performs a transaction-safe file upload.
        1. Pre-checks/pre-creates metadata in DB (sub-transaction).
        2. Uploads the file to GitHub.
        3. Saves/commits the DB record.
        4. If DB commit fails, cleans up the uploaded file from GitHub to avoid orphans.
        """
        # Upload file to GitHub first
        github_res = await cls.upload_file(
            token=token,
            owner=owner,
            repo=repo,
            path=path,
            content_bytes=content_bytes,
            message=message,
            sha=sha
        )
        uploaded_sha = github_res.get("content", {}).get("sha")
        if not uploaded_sha:
            raise GitHubServiceError("Failed to get SHA of uploaded file from GitHub response")

        try:
            # Execute database operation with the uploaded SHA
            db_record = await db_insert_func(uploaded_sha, path)
            db.commit()
            return db_record
        except Exception as db_err:
            logger.error("Database operation failed for upload %s. Deleting from GitHub to prevent orphan files.", path, exc_info=True)
            db.rollback()
            # Clean up the uploaded file from GitHub
            try:
                await cls.delete_file(
                    token=token,
                    owner=owner,
                    repo=repo,
                    path=path,
                    sha=uploaded_sha,
                    message=f"Cleanup orphan upload: {path}"
                )
            except Exception as cleanup_err:
                logger.error("Failed to clean up uploaded file %s from GitHub: %s", path, cleanup_err)
            raise db_err
