"""Loads the demo catalogue into PostgreSQL. Run with:  flask --app server seed-db"""
from __future__ import annotations

import hashlib
import secrets

import click
from werkzeug.security import generate_password_hash

from . import db
from .seed_catalog import BRANDS, CATEGORIES, COUPONS, PRODUCTS, REVIEW_SNIPPETS, REVIEWERS


def _stable(seed: str, modulo: int) -> int:
    """Deterministic pseudo-random number so seeding is reproducible."""
    return int(hashlib.sha256(seed.encode()).hexdigest(), 16) % modulo


def product_images(product: dict) -> list[tuple[str, str, str | None]]:
    images = []
    if product.get("photo"):
        images.append((product["photo"], product["name"], product["colors"][0][0]))
    for index, (color, _hex) in enumerate(product["colors"]):
        color_slug = color.lower().replace(" ", "-")
        alt = f"{product['name']} in {color}"
        images.append((f"images/products/{product['slug']}--{color_slug}.svg", alt, color))
        if index == 0:
            images.append((f"images/products/{product['slug']}--{color_slug}--detail.svg",
                           f"{alt} — detail", color))
    return images


def seed(reset: bool = False) -> None:
    if reset:
        click.echo("Removing existing catalogue…")
        db.execute("TRUNCATE product_images, product_variants, reviews, wishlist_items, cart_items, "
                   "products, categories, brands, coupons RESTART IDENTITY CASCADE")

    for order, (slug, name, description, image) in enumerate(CATEGORIES):
        db.execute(
            """
            INSERT INTO categories (slug, name, description, image_url, sort_order) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
                                             image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order
            """,
            (slug, name, description, image, order),
        )
    for slug, name, logo in BRANDS:
        db.execute(
            """
            INSERT INTO brands (slug, name, logo_url) VALUES (%s, %s, %s)
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, logo_url = EXCLUDED.logo_url
            """,
            (slug, name, logo),
        )
    category_ids = {r["slug"]: r["id"] for r in db.query("SELECT id, slug FROM categories")}
    brand_ids = {r["slug"]: r["id"] for r in db.query("SELECT id, slug FROM brands")}

    for p in PRODUCTS:
        product_id = db.scalar(
            """
            INSERT INTO products (slug, name, description, brand_id, category_id, gender, price,
                                  compare_at_price, material, fit, care, tags, is_featured, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now() - make_interval(days => %s))
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name, description = EXCLUDED.description, brand_id = EXCLUDED.brand_id,
                category_id = EXCLUDED.category_id, gender = EXCLUDED.gender, price = EXCLUDED.price,
                compare_at_price = EXCLUDED.compare_at_price, material = EXCLUDED.material,
                fit = EXCLUDED.fit, care = EXCLUDED.care, tags = EXCLUDED.tags,
                is_featured = EXCLUDED.is_featured
            RETURNING id
            """,
            (
                p["slug"], p["name"], p["description"], brand_ids[p["brand"]], category_ids[p["category"]],
                p["gender"], p["price"], p.get("compare"), p["material"], p["fit"],
                "Machine wash cold, inside out. Do not bleach. Line dry in shade. Warm iron.",
                p["tags"], p["featured"], p["days"],
            ),
        )
        db.execute("DELETE FROM product_images WHERE product_id = %s", (product_id,))
        db.execute_many(
            "INSERT INTO product_images (product_id, url, alt, color, sort_order) VALUES (%s, %s, %s, %s, %s)",
            [(product_id, url, alt, color, i) for i, (url, alt, color) in enumerate(product_images(p))],
        )
        for color, hex_code in p["colors"]:
            for size in p["sizes"]:
                roll = _stable(f"{p['slug']}{color}{size}", 100)
                stock = 0 if roll < 6 else (2 if roll < 16 else 8 + roll % 30)
                sku = f"VS{product_id}-{color[:6].upper().replace(' ', '')}-{size}"
                db.execute(
                    """
                    INSERT INTO product_variants (product_id, sku, size, color, color_hex, stock)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (product_id, size, color) DO UPDATE SET color_hex = EXCLUDED.color_hex
                    """,
                    (product_id, sku, size, color, hex_code, stock),
                )

    for code, description, kind, value, min_order, max_discount in COUPONS:
        db.execute(
            """
            INSERT INTO coupons (code, description, discount_type, value, min_order, max_discount)
            VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (code) DO NOTHING
            """,
            (code, description, kind, value, min_order, max_discount),
        )

    # Reviewer accounts get random, unusable passwords.
    reviewer_ids = []
    for i, name in enumerate(REVIEWERS):
        reviewer_ids.append(db.scalar(
            """
            INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s)
            ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id
            """,
            (name, f"reviewer{i + 1}@example.com", generate_password_hash(secrets.token_urlsafe(24))),
        ))
    for p in PRODUCTS:
        count = 2 + _stable(p["slug"], 3) if p["featured"] else _stable(p["slug"], 3)
        product_id = db.scalar("SELECT id FROM products WHERE slug = %s", (p["slug"],))
        for j in range(count):
            rating, title, body = REVIEW_SNIPPETS[_stable(p["slug"] + str(j), len(REVIEW_SNIPPETS))]
            db.execute(
                """
                INSERT INTO reviews (product_id, user_id, rating, title, body, is_verified)
                VALUES (%s, %s, %s, %s, %s, TRUE) ON CONFLICT (product_id, user_id) DO NOTHING
                """,
                (product_id, reviewer_ids[(j + _stable(p["slug"], 6)) % len(reviewer_ids)], rating, title, body),
            )

    click.echo(f"  {len(CATEGORIES)} categories, {len(BRANDS)} brands, {len(PRODUCTS)} products, "
               f"{len(COUPONS)} coupons")
