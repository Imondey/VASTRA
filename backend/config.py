"""Application configuration, read from environment variables (or a .env file)."""
import os
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    # --- core ---
    ENV = os.getenv("APP_ENV", "development")
    # In development a fixed fallback keeps you signed in across restarts;
    # production refuses to start without a real SECRET_KEY (see create_app).
    SECRET_KEY = os.getenv("SECRET_KEY") or ("" if ENV == "production" else "dev-only-insecure-key")
    DEBUG = ENV == "development"

    # --- database ---
    DATABASE_URL = os.getenv(
        "DATABASE_URL", "postgresql://vastra:vastra@localhost:5432/vastra_db"
    )
    DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "1"))
    DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))

    # --- sessions ---
    SESSION_COOKIE_NAME = "vastra_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", ENV == "production")
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # --- uploads ---
    FRONTEND_DIR = BASE_DIR / "frontend"
    UPLOAD_DIR = FRONTEND_DIR / "uploads"
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB
    ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

    # --- commerce ---
    CURRENCY = "INR"
    FREE_SHIPPING_THRESHOLD = Decimal(os.getenv("FREE_SHIPPING_THRESHOLD", "1999"))
    SHIPPING_FEE = Decimal(os.getenv("SHIPPING_FEE", "99"))
    MAX_QTY_PER_ITEM = 10
