"""Authentication helpers, request guards and security headers."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from functools import wraps
from urllib.parse import urlparse

from flask import Flask, g, request, session

from . import db
from .utils import ApiError

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


# ---------------------------------------------------------------- users
def load_current_user() -> dict | None:
    if "user" in g:
        return g.user
    user = None
    user_id = session.get("user_id")
    if user_id:
        user = db.query_one(
            "SELECT id, full_name, email, phone, role, created_at, session_version "
            "FROM users WHERE id = %s AND is_active",
            (user_id,),
        )
        if user is None or user["session_version"] != session.get("sv"):
            session.pop("user_id", None)
            session.pop("sv", None)
            user = None
    g.user = user
    return user


def current_user_id() -> int | None:
    user = load_current_user()
    return user["id"] if user else None


def login_user(user_id: int) -> None:
    cart_id = session.get("cart_id")
    session.clear()  # prevent session fixation
    session.permanent = True
    session["user_id"] = user_id
    session["sv"] = db.scalar("SELECT session_version FROM users WHERE id = %s", (user_id,))
    if cart_id:
        session["guest_cart_id"] = cart_id
    g.pop("user", None)


def revoke_other_sessions(user_id: int) -> None:
    """Invalidate every existing session cookie for this user, keeping the current one."""
    session["sv"] = db.scalar(
        "UPDATE users SET session_version = session_version + 1 WHERE id = %s RETURNING session_version",
        (user_id,),
    )
    g.pop("user", None)


def logout_user() -> None:
    session.clear()
    g.pop("user", None)


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if load_current_user() is None:
            raise ApiError("Please sign in to continue.", 401)
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = load_current_user()
        if user is None:
            raise ApiError("Please sign in to continue.", 401)
        if user["role"] != "admin":
            raise ApiError("You do not have access to this area.", 403)
        return view(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------- rate limiting
class RateLimiter:
    """Small in-process sliding-window limiter (per worker process)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] > window:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True


limiter = RateLimiter()


def rate_limit(name: str, limit: int, window: int):
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            key = f"{name}:{request.remote_addr}"
            if not limiter.hit(key, limit, window):
                raise ApiError("Too many attempts. Please wait a few minutes and try again.", 429)
            return view(*args, **kwargs)
        return wrapper
    return decorator


# ------------------------------------------------------------ guards
def init_app(app: Flask) -> None:
    @app.before_request
    def csrf_guard():
        if not request.path.startswith("/api/") or request.method in SAFE_METHODS:
            return None
        # A custom header cannot be sent cross-site without a CORS preflight,
        # which this API never grants — this blocks CSRF from other origins.
        if request.headers.get("X-Requested-With") != "fetch":
            raise ApiError("Invalid request.", 403)
        origin = request.headers.get("Origin")
        if origin and urlparse(origin).netloc != request.host:
            raise ApiError("Cross-origin request blocked.", 403)
        return None

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "img-src 'self' data: blob:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "script-src 'self'; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response
