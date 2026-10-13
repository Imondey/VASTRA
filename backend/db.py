"""PostgreSQL access layer.

One pooled connection is checked out per request (lazily) and the whole request
runs inside a single transaction. It is committed in an ``after_request`` hook —
before the response is sent, so a failed commit becomes a 500 instead of a
false success — and rolled back on any error. CLI commands commit explicitly.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

import psycopg2
import psycopg2.extras
import psycopg2.pool
from flask import Flask, current_app, g, jsonify

log = logging.getLogger(__name__)
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def init_app(app: Flask) -> None:
    app.after_request(_commit_request)
    app.teardown_appcontext(_release_connection)


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        cfg = current_app.config
        _pool = psycopg2.pool.ThreadedConnectionPool(
            cfg["DB_POOL_MIN"], cfg["DB_POOL_MAX"], dsn=cfg["DATABASE_URL"]
        )
    return _pool


def get_conn():
    if "db_conn" not in g:
        conn = _get_pool().getconn()
        conn.autocommit = False
        g.db_conn = conn
    return g.db_conn


def _safe_rollback(conn) -> None:
    if conn is None or conn.closed:
        return
    try:
        conn.rollback()
    except psycopg2.Error:
        log.warning("Rollback failed; connection will be discarded", exc_info=True)


def _commit_request(response):
    conn = g.get("db_conn")
    if conn is None:
        return response
    if g.get("db_failed") or response.status_code >= 500:
        _safe_rollback(conn)
        return response
    try:
        conn.commit()
    except psycopg2.Error:
        log.exception("Commit failed")
        _safe_rollback(conn)
        g.db_failed = True
        failed = jsonify({"error": "We could not save your changes. Please try again."})
        failed.status_code = 500
        return failed
    return response


def _release_connection(exc: BaseException | None) -> None:
    conn = g.pop("db_conn", None)
    if conn is None:
        return
    # Anything not committed by now (errors, CLI without commit) is discarded.
    _safe_rollback(conn)
    _get_pool().putconn(conn, close=bool(conn.closed))


def mark_failed() -> None:
    """Ensure the current transaction is rolled back and never committed."""
    _safe_rollback(g.get("db_conn"))
    g.db_failed = True


def _cursor():
    return get_conn().cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def query(sql: str, params: Iterable[Any] | dict | None = None) -> list[dict]:
    with _cursor() as cur:
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def query_one(sql: str, params: Iterable[Any] | dict | None = None) -> dict | None:
    with _cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def scalar(sql: str, params: Iterable[Any] | dict | None = None) -> Any:
    with get_conn().cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return row[0] if row else None


def execute(sql: str, params: Iterable[Any] | dict | None = None) -> int:
    """Run a statement and return the affected row count."""
    with get_conn().cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def execute_many(sql: str, rows: list[tuple]) -> None:
    if not rows:
        return
    with get_conn().cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, rows)


def commit() -> None:
    get_conn().commit()
