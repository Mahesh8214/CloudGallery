import hashlib
import os

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2 HMAC SHA-256 with a random salt."""
    salt = os.urandom(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return f"{salt.hex()}:{pwd_hash.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its PBKDF2 hash."""
    if not hashed:
        return False
    try:
        salt_hex, hash_hex = hashed.split(":")
        salt = bytes.fromhex(salt_hex)
        expected = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000).hex()
        return hash_hex == expected
    except Exception:
        return False
