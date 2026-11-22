"""Create the product category tree and categorize existing catalog products."""

from uuid import uuid4

from alembic import context, op
import sqlalchemy as sa

from app.product_categories import PRODUCT_CATEGORY_DEFINITIONS, product_category_slug


revision = "20261122_0034"
down_revision = "20261121_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        # This data backfill classifies existing product rows and needs a live connection.
        return

    connection = op.get_bind()
    categories = sa.table(
        "product_categories",
        sa.column("id", sa.Uuid(as_uuid=True)),
        sa.column("slug", sa.String(length=180)),
        sa.column("name", sa.String(length=100)),
        sa.column("parent_id", sa.Uuid(as_uuid=True)),
        sa.column("active", sa.Boolean()),
    )
    existing_ids = dict(connection.execute(sa.select(categories.c.slug, categories.c.id)).all())
    category_ids = {}
    for definition in PRODUCT_CATEGORY_DEFINITIONS:
        category_id = existing_ids.get(definition.slug)
        if category_id is None:
            category_id = uuid4()
            connection.execute(sa.insert(categories).values(
                id=category_id,
                slug=definition.slug,
                name=definition.name,
                parent_id=None,
                active=True,
            ))
        category_ids[definition.slug] = category_id
        connection.execute(sa.update(categories).where(categories.c.id == category_id).values(
            name=definition.name,
            parent_id=category_ids.get(definition.parent_slug) if definition.parent_slug else None,
            active=True,
        ))

    products = sa.table(
        "products",
        sa.column("id", sa.Uuid(as_uuid=True)),
        sa.column("name", sa.String(length=240)),
        sa.column("category_name", sa.String(length=100)),
        sa.column("product_type", sa.String(length=100)),
        sa.column("tags", sa.JSON()),
        sa.column("size_tier", sa.String(length=40)),
        sa.column("category_id", sa.Uuid(as_uuid=True)),
    )
    for product in connection.execute(sa.select(
        products.c.id,
        products.c.name,
        products.c.category_name,
        products.c.product_type,
        products.c.tags,
        products.c.size_tier,
    )).mappings():
        slug = product_category_slug(
            name=product["name"],
            category_name=product["category_name"],
            product_type=product["product_type"],
            tags=product["tags"],
            size_tier=product["size_tier"],
        )
        definition = next(category for category in PRODUCT_CATEGORY_DEFINITIONS if category.slug == slug)
        connection.execute(sa.update(products).where(products.c.id == product["id"]).values(
            category_id=category_ids[slug],
            category_name=definition.name,
        ))


def downgrade() -> None:
    connection = op.get_bind()
    categories = sa.table(
        "product_categories",
        sa.column("id", sa.Uuid(as_uuid=True)),
        sa.column("slug", sa.String(length=180)),
        sa.column("active", sa.Boolean()),
    )
    products = sa.table(
        "products",
        sa.column("category_id", sa.Uuid(as_uuid=True)),
    )
    category_ids = select_category_ids(connection, categories)
    if category_ids:
        connection.execute(sa.update(products).where(products.c.category_id.in_(category_ids)).values(category_id=None))
        connection.execute(sa.update(categories).where(categories.c.id.in_(category_ids)).values(active=False))


def select_category_ids(connection, categories):
    slugs = [category.slug for category in PRODUCT_CATEGORY_DEFINITIONS]
    return list(connection.scalars(sa.select(categories.c.id).where(categories.c.slug.in_(slugs))))
