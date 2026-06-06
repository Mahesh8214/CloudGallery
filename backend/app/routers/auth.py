"""
Authentication router – GitHub OAuth 2.0 flow.

Endpoints:
  GET  /api/auth/login    → Redirect user to GitHub for authorisation.
  GET  /api/auth/callback → Handle the OAuth callback, issue session cookie.
  GET  /api/auth/me       → Return the authenticated user's profile.
  POST /api/auth/logout   → Clear the session cookie.
"""

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import UserResponse, UserRegister, UserLoginPass, TokenLink
from app.services.encryption import encrypt_token
from app.services.github import GitHubService
from app.utils.security import hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


# ── Login ───────────────────────────────────────────────────────────────

@router.get("/login")
async def login():
    """
    Redirect the browser to GitHub's OAuth authorisation page.

    Scopes requested:
      - repo          – full access to private repos (needed for file CRUD)
      - read:user     – read user profile data
      - user:email    – read email addresses
    """
    params = urlencode(
        {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
            "scope": "repo,read:user,user:email",
        }
    )
    github_auth_url = f"https://github.com/login/oauth/authorize?{params}"
    return RedirectResponse(url=github_auth_url, status_code=status.HTTP_302_FOUND)


# ── Callback ────────────────────────────────────────────────────────────

@router.get("/callback")
async def callback(code: str, db: Session = Depends(get_db)):
    """
    Handle the GitHub OAuth callback.

    1. Exchange the temporary *code* for an access token.
    2. Fetch the user's profile and primary email from GitHub.
    3. Create or update the User record in the database.
    4. Issue a signed JWT session cookie.
    5. Redirect to the frontend (setup page if no repo selected, else dashboard).
    """
    # ─ Step 1: exchange code → access token ─────────────────────────
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )

    if token_response.status_code != 200:
        logger.error("GitHub token exchange failed: %s", token_response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to exchange authorisation code with GitHub.",
        )

    token_data = token_response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        error_desc = token_data.get("error_description", "Unknown error")
        logger.error("No access_token in GitHub response: %s", error_desc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub OAuth error: {error_desc}",
        )

    # ─ Step 2: fetch user profile ────────────────────────────────────
    try:
        gh_user = await GitHubService.get_user(access_token)
    except Exception:
        logger.exception("Failed to fetch GitHub user profile")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch user profile from GitHub.",
        )

    # Attempt to get primary email
    email: str | None = gh_user.get("email")
    if not email:
        try:
            emails = await GitHubService.get_user_emails(access_token)
            primary = next(
                (e for e in emails if e.get("primary") and e.get("verified")),
                None,
            )
            if primary:
                email = primary["email"]
        except Exception:
            logger.debug("Could not fetch user emails – not critical.")

    # ─ Step 3: upsert user ──────────────────────────────────────────
    github_id = gh_user["id"]
    encrypted_token = encrypt_token(access_token)

    user = db.query(User).filter(User.github_id == github_id).first()
    if user:
        user.username = gh_user["login"]
        user.email = email
        user.avatar_url = gh_user.get("avatar_url")
        user.access_token_encrypted = encrypted_token
        user.updated_at = datetime.now(timezone.utc)
    else:
        user = User(
            github_id=github_id,
            username=gh_user["login"],
            email=email,
            avatar_url=gh_user.get("avatar_url"),
            access_token_encrypted=encrypted_token,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    # ─ Step 4: issue JWT session cookie ──────────────────────────────
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    jwt_payload = {
        "sub": str(user.id),
        "username": user.username,
        "exp": expire,
    }
    session_token = jwt.encode(
        jwt_payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    # ─ Step 5: redirect to frontend ─────────────────────────────────
    redirect_path = "/setup" if not user.repository_name else "/dashboard"
    redirect_url = f"{settings.FRONTEND_URL}{redirect_path}"

    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key="session",
        value=session_token,
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=False,  # Set True in production behind HTTPS
        path="/",
    )
    return response


# ── Me ──────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return user


# ── Logout ──────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout():
    """
    Clear the session cookie and return a success message.

    The JWT is stateless so no server-side session invalidation is needed;
    clearing the cookie is sufficient.
    """
    response_data = {"detail": "Logged out successfully"}
    from fastapi.responses import JSONResponse

    response = JSONResponse(content=response_data)
    response.delete_cookie(
        key="session",
        path="/",
        httponly=True,
        samesite="lax",
    )
    return response


# ── Username & Password Registration / Login ───────────────────────────

from fastapi.responses import JSONResponse

@router.post("/register")
async def register(body: UserRegister, db: Session = Depends(get_db)):
    """Register a new user with username and password."""
    # Check if username exists
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken.",
        )

    # Hash the password and create user
    hashed = hash_password(body.password)
    user = User(
        username=body.username,
        password_hash=hashed,
        email=body.email,
        github_id=None,
        access_token_encrypted=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create JWT session cookie
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    jwt_payload = {
        "sub": str(user.id),
        "username": user.username,
        "exp": expire,
    }
    session_token = jwt.encode(
        jwt_payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    response = JSONResponse(
        content={"detail": "Registration successful", "user": UserResponse.model_validate(user).model_dump()}
    )
    response.set_cookie(
        key="session",
        value=session_token,
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return response


@router.post("/login-pass")
async def login_pass(body: UserLoginPass, db: Session = Depends(get_db)):
    """Authenticate via username and password."""
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Create JWT session cookie
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    jwt_payload = {
        "sub": str(user.id),
        "username": user.username,
        "exp": expire,
    }
    session_token = jwt.encode(
        jwt_payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    response = JSONResponse(
        content={"detail": "Login successful", "user": UserResponse.model_validate(user).model_dump()}
    )
    response.set_cookie(
        key="session",
        value=session_token,
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return response


@router.post("/link-token", response_model=UserResponse)
async def link_token(
    body: TokenLink,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link a GitHub Personal Access Token to the active custom user profile."""
    # Validate the token with GitHub
    try:
        gh_user = await GitHubService.get_user(body.token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub Personal Access Token.",
        )

    # Encrypt the token
    encrypted_token = encrypt_token(body.token)

    # Update the user profile with GitHub details
    user.github_id = gh_user["id"]
    user.avatar_url = gh_user.get("avatar_url")
    user.access_token_encrypted = encrypted_token
    user.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)

    return user

