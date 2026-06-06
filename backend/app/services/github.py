"""
GitHub REST API v3 service layer.

Encapsulates all interactions with the GitHub Contents API, user API,
and repository management endpoints.  Every public method is async and
accepts the user's decrypted access token as its first argument.
"""

import asyncio
import base64
import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.github.com"
_DEFAULT_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# Retry configuration for rate-limit and transient errors.
_MAX_RETRIES = 3
_RETRY_BACKOFF = 1.0  # seconds


class GitHubServiceError(Exception):
    """Raised when a GitHub API call fails after retries."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class GitHubService:
    """Stateless helper – all state is passed via method arguments."""

    _repo_locks: Dict[str, asyncio.Lock] = {}

    @classmethod
    def _get_repo_lock(cls, owner: str, repo: str) -> asyncio.Lock:
        key = f"{owner}/{repo}".lower()
        if key not in cls._repo_locks:
            cls._repo_locks[key] = asyncio.Lock()
        return cls._repo_locks[key]

    # ── Internal helpers ────────────────────────────────────────────

    @staticmethod
    def _auth_headers(token: str) -> Dict[str, str]:
        """Build request headers with Bearer auth."""
        return {
            **_DEFAULT_HEADERS,
            "Authorization": f"Bearer {token}",
        }

    @classmethod
    async def _request(
        cls,
        method: str,
        url: str,
        token: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> httpx.Response:
        """
        Perform an HTTP request to the GitHub API with automatic retries
        on 429 (rate limit) and 5xx server errors.
        """
        headers = cls._auth_headers(token)

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.request(
                        method,
                        url,
                        headers=headers,
                        json=json_body,
                        params=params,
                    )

                # Success or client error (except 429) → return immediately
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", _RETRY_BACKOFF * attempt))
                    logger.warning(
                        "GitHub rate-limited (429). Retrying in %ds (attempt %d/%d)",
                        retry_after, attempt, _MAX_RETRIES,
                    )
                    await asyncio.sleep(retry_after)
                    continue

                if response.status_code >= 500:
                    logger.warning(
                        "GitHub server error %d. Retrying in %ds (attempt %d/%d)",
                        response.status_code, _RETRY_BACKOFF * attempt, attempt, _MAX_RETRIES,
                    )
                    await asyncio.sleep(_RETRY_BACKOFF * attempt)
                    continue

                return response

            except httpx.RequestError as exc:
                logger.warning(
                    "Request to %s failed: %s (attempt %d/%d)",
                    url, exc, attempt, _MAX_RETRIES,
                )
                if attempt == _MAX_RETRIES:
                    raise GitHubServiceError(
                        f"Failed to reach GitHub after {_MAX_RETRIES} attempts: {exc}"
                    ) from exc
                await asyncio.sleep(_RETRY_BACKOFF * attempt)

        # If we exhausted retries on 429 / 5xx, return the last response
        # so callers can inspect the status code.
        return response  # type: ignore[possibly-undefined]

    @classmethod
    def _raise_for_status(cls, response: httpx.Response, context: str = "") -> None:
        """Raise GitHubServiceError for non-2xx responses."""
        if 200 <= response.status_code < 300:
            return
        detail = response.text[:500]
        msg = f"GitHub API error {response.status_code}"
        if context:
            msg += f" ({context})"
        msg += f": {detail}"
        raise GitHubServiceError(msg, status_code=response.status_code)

    # ── User ────────────────────────────────────────────────────────

    @classmethod
    async def get_user(cls, token: str) -> Dict[str, Any]:
        """
        Fetch the authenticated user's profile.

        GET /user
        """
        resp = await cls._request("GET", f"{_BASE_URL}/user", token)
        cls._raise_for_status(resp, "get_user")
        return resp.json()

    @classmethod
    async def get_user_emails(cls, token: str) -> List[Dict[str, Any]]:
        """
        Fetch the authenticated user's email addresses.

        GET /user/emails
        """
        resp = await cls._request("GET", f"{_BASE_URL}/user/emails", token)
        cls._raise_for_status(resp, "get_user_emails")
        return resp.json()

    # ── Repositories ────────────────────────────────────────────────

    @classmethod
    async def list_private_repos(cls, token: str) -> List[Dict[str, Any]]:
        """
        List the user's private repositories (owner only).

        GET /user/repos?type=owner&sort=updated&per_page=100
        """
        resp = await cls._request(
            "GET",
            f"{_BASE_URL}/user/repos",
            token,
            params={"type": "owner", "sort": "updated", "per_page": 100},
        )
        cls._raise_for_status(resp, "list_private_repos")
        repos = resp.json()
        return [r for r in repos if r.get("private", False)]

    @classmethod
    async def create_repo(cls, token: str, name: str) -> Dict[str, Any]:
        """
        Create a new private repository with auto-init enabled.

        POST /user/repos
        """
        resp = await cls._request(
            "POST",
            f"{_BASE_URL}/user/repos",
            token,
            json_body={
                "name": name,
                "private": True,
                "auto_init": True,
                "description": "Personal Cloud Gallery storage",
            },
        )
        cls._raise_for_status(resp, "create_repo")
        return resp.json()

    @classmethod
    async def get_repo(cls, token: str, owner: str, repo: str) -> Dict[str, Any]:
        """
        Get repository details.

        GET /repos/{owner}/{repo}
        """
        resp = await cls._request("GET", f"{_BASE_URL}/repos/{owner}/{repo}", token)
        cls._raise_for_status(resp, "get_repo")
        return resp.json()

    # ── File / directory operations ─────────────────────────────────

    @classmethod
    async def get_file_content(
        cls, token: str, owner: str, repo: str, path: str
    ) -> Dict[str, Any]:
        """
        Retrieve a single file's content and metadata.

        GET /repos/{owner}/{repo}/contents/{path}
        """
        resp = await cls._request(
            "GET", f"{_BASE_URL}/repos/{owner}/{repo}/contents/{path}", token
        )
        cls._raise_for_status(resp, f"get_file_content({path})")
        return resp.json()

    @classmethod
    async def create_or_update_file(
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
        Create or update a file in the repository.

        PUT /repos/{owner}/{repo}/contents/{path}

        The content is base64-encoded before sending.  When updating an
        existing file the sha of the current blob must be provided.
        """
        lock = cls._get_repo_lock(owner, repo)
        async with lock:
            body: Dict[str, Any] = {
                "message": message,
                "content": base64.b64encode(content_bytes).decode(),
            }
            if sha:
                body["sha"] = sha

            resp = await cls._request(
                "PUT",
                f"{_BASE_URL}/repos/{owner}/{repo}/contents/{path}",
                token,
                json_body=body,
            )
            cls._raise_for_status(resp, f"create_or_update_file({path})")
            return resp.json()

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
        Delete a file from the repository.

        DELETE /repos/{owner}/{repo}/contents/{path}
        """
        lock = cls._get_repo_lock(owner, repo)
        async with lock:
            body: Dict[str, Any] = {
                "message": message,
                "sha": sha,
            }
            resp = await cls._request(
                "DELETE",
                f"{_BASE_URL}/repos/{owner}/{repo}/contents/{path}",
                token,
                json_body=body,
            )
            cls._raise_for_status(resp, f"delete_file({path})")
            return resp.json()

    @classmethod
    async def get_directory_contents(
        cls,
        token: str,
        owner: str,
        repo: str,
        path: str = "",
    ) -> List[Dict[str, Any]]:
        """
        List files and sub-directories at the given path.

        GET /repos/{owner}/{repo}/contents/{path}

        Returns a list of content items.  If the path does not exist an
        empty list is returned instead of raising.
        """
        resp = await cls._request(
            "GET", f"{_BASE_URL}/repos/{owner}/{repo}/contents/{path}", token
        )
        if resp.status_code == 404:
            return []
        cls._raise_for_status(resp, f"get_directory_contents({path})")
        data = resp.json()
        # The API returns a list for directories, a dict for single files.
        if isinstance(data, dict):
            return [data]
        return data

    @classmethod
    async def get_raw_file_url(
        cls,
        token: str,
        owner: str,
        repo: str,
        path: str,
    ) -> str:
        """
        Build a download URL for a raw file that includes the token for
        authentication.  This URL can be used to fetch private repo content.

        Returns
        -------
        str
            Direct download URL with auth token embedded as a query param.
        """
        return (
            f"https://raw.githubusercontent.com/{owner}/{repo}/main/{path}"
        )

    @classmethod
    async def download_file(
        cls,
        token: str,
        owner: str,
        repo: str,
        path: str,
    ) -> bytes:
        """
        Download raw file bytes from the repository.

        Uses the raw.githubusercontent.com endpoint with Bearer auth.
        """
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/{path}"
        headers = cls._auth_headers(token)
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise GitHubServiceError(
                f"Failed to download {path}: HTTP {resp.status_code}",
                status_code=resp.status_code,
            )
        return resp.content
