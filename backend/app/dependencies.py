"""
FastAPI dependencies for authentication and token retrieval.

get_current_user  – extracts + validates the JWT session cookie.
get_github_token  – decrypts the user's stored GitHub access token.
"""

import logging
from typing import Generator

from fastapi import Cookie, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.services.encryption import decrypt_token as _decrypt

logger = logging.getLogger(__name__)


def get_current_user(
    request: Request,
    session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency that returns the authenticated User or raises 401.

    Reads the ``session`` cookie, decodes the JWT, and fetches the
    corresponding User row from the database.

    Parameters
    ----------
    request : Request
        The incoming HTTP request (unused directly but available for
        future IP / user-agent checks).
    session : str | None
        JWT value from the ``session`` HttpOnly cookie.
    db : Session
        SQLAlchemy database session.

    Returns
    -------
    User
        The authenticated user ORM instance.

    Raises
    ------
    HTTPException 401
        If the cookie is missing, the JWT is invalid / expired, or the
        user no longer exists in the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not session:
        raise credentials_exception

    try:
        payload = jwt.decode(
            session,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception

    return user


def get_github_token(
    user: User = Depends(get_current_user),
) -> str:
    """
    Dependency that returns the decrypted GitHub access token for the
    currently authenticated user.

    Parameters
    ----------
    user : User
        The authenticated user (injected via ``get_current_user``).

    Returns
    -------
    str
        Plaintext GitHub access token.

    Raises
    ------
    HTTPException 401
        If the user has no stored token or decryption fails.
    """
    if not user.access_token_encrypted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="GitHub token not found. Please re-authenticate.",
        )
    try:
        return _decrypt(user.access_token_encrypted)
    except Exception:
        logger.exception("Token decryption failed for user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="GitHub token decryption failed. Please re-authenticate.",
        )
