"""Flask CLI commands:  flask --app server <command>

    init-db        create / update all tables
    seed-db        load the demo catalogue, coupons and demo accounts
    create-admin   create (or promote) an administrator account
"""
from __future__ import annotations

import click
from flask import Flask
from werkzeug.security import generate_password_hash

from . import db
from .config import BASE_DIR


def init_app(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db_command():
        """Create database tables from database/schema.sql."""
        sql = (BASE_DIR / "database" / "schema.sql").read_text(encoding="utf-8")
        db.execute(sql)
        db.commit()
        click.secho("✓ Database schema is up to date.", fg="green")

    @app.cli.command("seed-db")
    @click.option("--reset", is_flag=True, help="Wipe catalogue, carts, wishlists, reviews, coupons and order lines first (demo reset).")
    def seed_db_command(reset: bool):
        """Insert the demo catalogue (idempotent)."""
        from .seed import seed
        seed(reset=reset)
        db.commit()
        click.secho("✓ Demo data loaded.", fg="green")

    @app.cli.command("create-admin")
    @click.option("--email", prompt=True)
    @click.option("--name", prompt="Full name", default="VASTRA Admin")
    @click.password_option()
    def create_admin_command(email: str, name: str, password: str):
        """Create an admin user, or promote an existing one."""
        email = email.strip().lower()
        if len(password) < 8:
            raise click.BadParameter("Password must be at least 8 characters.")
        db.execute(
            """
            INSERT INTO users (full_name, email, password_hash, role)
            VALUES (%s, %s, %s, 'admin')
            ON CONFLICT (email) DO UPDATE
               SET role = 'admin', password_hash = EXCLUDED.password_hash, is_active = TRUE
            """,
            (name, email, generate_password_hash(password)),
        )
        db.commit()
        click.secho(f"✓ {email} is now an administrator.", fg="green")
