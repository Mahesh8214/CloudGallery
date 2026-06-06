"""
Repository management router.

Endpoints:
  GET  /api/repos         → List the user's private GitHub repos.
  POST /api/repos/select  → Select an existing repo for gallery storage.
  POST /api/repos/create  → Create a new private repo on GitHub.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_github_token
from app.models import User
from app.schemas import RepoCreate, RepoInfo, RepoSelect
from app.services.github import GitHubService, GitHubServiceError

logger = logging.getLogger(__name__)
router = APIRouter(tags=["repos"])


# ── List repos ──────────────────────────────────────────────────────────

@router.get("/", response_model=list[RepoInfo])
async def list_repos(
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
):
    """
    Return a list of the authenticated user's private repositories
    from GitHub.  These can be selected as gallery storage targets.
    """
    try:
        repos = await GitHubService.list_private_repos(token)
    except GitHubServiceError as exc:
        logger.error("Failed to list repos: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch repositories from GitHub.",
        )

    return [
        RepoInfo(
            id=repo["id"],
            name=repo["name"],
            full_name=repo["full_name"],
            private=repo["private"],
            owner=repo["owner"]["login"],
        )
        for repo in repos
    ]


# ── Select existing repo ───────────────────────────────────────────────

@router.post("/select", response_model=RepoInfo)
async def select_repo(
    body: RepoSelect,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """
    Select an existing private repository to use as gallery storage.

    Verifies that the repository exists and belongs to the user on GitHub
    before persisting the selection.
    """
    try:
        repo = await GitHubService.get_repo(token, body.repo_owner, body.repo_name)
    except GitHubServiceError as exc:
        logger.error("Failed to verify repo %s/%s: %s", body.repo_owner, body.repo_name, exc)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{body.repo_owner}/{body.repo_name}' not found or inaccessible.",
        )

    # Update user record
    user.repository_id = repo["id"]
    user.repository_name = repo["name"]
    user.repository_owner = repo["owner"]["login"]
    db.commit()
    db.refresh(user)

    return RepoInfo(
        id=repo["id"],
        name=repo["name"],
        full_name=repo["full_name"],
        private=repo.get("private", True),
        owner=repo["owner"]["login"],
    )


# ── Create new repo ────────────────────────────────────────────────────

@router.post("/create", response_model=RepoInfo, status_code=status.HTTP_201_CREATED)
async def create_repo(
    body: RepoCreate,
    user: User = Depends(get_current_user),
    token: str = Depends(get_github_token),
    db: Session = Depends(get_db),
):
    """
    Create a new **private** repository on GitHub and immediately select
    it for gallery storage.  The repo is auto-initialised with a README.
    """
    try:
        repo = await GitHubService.create_repo(token, body.name)
    except GitHubServiceError as exc:
        logger.error("Failed to create repo '%s': %s", body.name, exc)
        # Surface GitHub's error message if available
        detail = "Failed to create repository on GitHub."
        if "name already exists" in str(exc).lower():
            detail = f"Repository '{body.name}' already exists."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    # Persist selection
    user.repository_id = repo["id"]
    user.repository_name = repo["name"]
    user.repository_owner = repo["owner"]["login"]
    db.commit()
    db.refresh(user)

    return RepoInfo(
        id=repo["id"],
        name=repo["name"],
        full_name=repo["full_name"],
        private=repo.get("private", True),
        owner=repo["owner"]["login"],
    )
