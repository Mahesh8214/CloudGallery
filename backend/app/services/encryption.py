"""
Fernet symmetric encryption for GitHub access tokens.

Tokens are encrypted before being stored in the database and decrypted
only when needed for GitHub API calls.  The Fernet key is read from
settings.ENCRYPTION_KEY; if that value is empty a key is generated and
logged (development convenience – must be set explicitly in production).
"""

import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

# ── Key initialisation ──────────────────────────────────────────────────

_encryption_key: str = settings.ENCRYPTION_KEY

if not _encryption_key:
    _encryption_key = Fernet.generate_key().decode()
    logger.warning(
        "ENCRYPTION_KEY not set – generated a temporary key.  "
        "Set ENCRYPTION_KEY in .env for production to avoid data loss "
        "on restart.  Generated key: %s",
        _encryption_key,
    )
    # Persist back to the settings object so other modules can read it
    settings.ENCRYPTION_KEY = _encryption_key

_fernet = Fernet(_encryption_key.encode() if isinstance(_encryption_key, str) else _encryption_key)


# ── Public API ──────────────────────────────────────────────────────────

def encrypt_token(token: str) -> str:
    """
    Encrypt a plaintext token and return the ciphertext as a UTF-8 string.

    Parameters
    ----------
    token : str
        The plaintext GitHub access token.

    Returns
    -------
    str
        Fernet-encrypted token, base64-encoded.
    """
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    """
    Decrypt a Fernet-encrypted token back to plaintext.

    Parameters
    ----------
    encrypted : str
        The encrypted token string stored in the database.

    Returns
    -------
    str
        Plaintext GitHub access token.

    Raises
    ------
    InvalidToken
        If the encrypted blob is malformed or the key does not match.
    """
    try:
        return _fernet.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        logger.error("Failed to decrypt token – key mismatch or corrupted data.")
        raise
