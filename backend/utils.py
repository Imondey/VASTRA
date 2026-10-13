"""Shared helpers: API errors, validation and formatting."""
from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

from flask import request

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9 \-]{7,15}$")
PIN_RE = re.compile(r"^[A-Za-z0-9 \-]{3,10}$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, fields: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.fields = fields or {}


def json_body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object.")
    return data


def text(data: dict, key: str, *, required: bool = False, max_len: int = 255,
         label: str | None = None, default: str = "") -> str:
    value = data.get(key, default)
    if value is None:
        value = ""
    if not isinstance(value, (str, int, float)):
        raise ApiError(f"{label or key} is invalid.", fields={key: "Invalid value"})
    value = str(value).strip()
    if required and not value:
        raise ApiError(f"{label or key.replace('_', ' ').capitalize()} is required.",
                       fields={key: "Required"})
    if len(value) > max_len:
        raise ApiError(f"{label or key} must be at most {max_len} characters.",
                       fields={key: "Too long"})
    return value


def email(data: dict, key: str = "email") -> str:
    value = text(data, key, required=True, max_len=255, label="Email").lower()
    if not EMAIL_RE.match(value):
        raise ApiError("Please enter a valid email address.", fields={key: "Invalid email"})
    return value


def phone(data: dict, key: str = "phone", required: bool = True) -> str:
    value = text(data, key, required=required, max_len=20, label="Phone")
    if value and not PHONE_RE.match(value):
        raise ApiError("Please enter a valid phone number.", fields={key: "Invalid phone"})
    return value


def integer(value: Any, *, default: int | None = None, minimum: int | None = None,
            maximum: int | None = None, label: str = "value") -> int:
    if value in (None, ""):
        if default is None:
            raise ApiError(f"{label} is required.")
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(f"{label} must be a whole number.") from None
    if abs(number) > 2**62:
        raise ApiError(f"{label} is out of range.")
    if minimum is not None and number < minimum:
        raise ApiError(f"{label} must be at least {minimum}.")
    if maximum is not None and number > maximum:
        raise ApiError(f"{label} must be at most {maximum}.")
    return number


def money(value: Any, *, label: str = "amount", allow_none: bool = False) -> Decimal | None:
    if value in (None, ""):
        if allow_none:
            return None
        raise ApiError(f"{label} is required.")
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ApiError(f"{label} must be a number.") from None
    if not amount.is_finite() or amount >= Decimal("100000000"):
        raise ApiError(f"{label} is out of range.")
    if amount < 0:
        raise ApiError(f"{label} cannot be negative.")
    return amount


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value[:170] or "item"


def csv_arg(name: str) -> list[str]:
    raw = request.args.get(name, "")
    return [part.strip() for part in raw.split(",") if part.strip()][:20]


def to_money(value: Decimal | float | int) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))
