from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from core.config import settings

# Use the bcrypt library directly instead of passlib. passlib 1.7.4 is
# incompatible with bcrypt >= 4.1 (it crashes during backend detection),
# which previously caused every registration to fail with a 500 error.

# bcrypt only hashes the first 72 bytes; longer inputs raise in bcrypt 5.x,
# so we truncate explicitly (matching standard bcrypt behaviour).
def _to_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode["exp"] = expire
    to_encode["type"] = "refresh"
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_purpose_token(user_id: int, purpose: str, expires: timedelta) -> str:
    """Short-lived single-purpose token (e.g. password reset, email verification)."""
    to_encode = {
        "sub": str(user_id),
        "type": purpose,
        "exp": datetime.now(timezone.utc) + expires,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_purpose_token(token: str, expected_purpose: str) -> Optional[int]:
    """Return the user_id if the token is valid and matches the expected purpose."""
    payload = decode_token(token)
    if not payload or payload.get("type") != expected_purpose:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        return None


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
