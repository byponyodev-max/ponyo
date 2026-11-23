"""Product demo marker migration backfills only the products table."""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def product_demo_revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261123_0036_product_demo_flag.py"
    spec = importlib.util.spec_from_file_location("product_demo_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("20261123_0036", "20261122_0035")
    return module


def test_upgrade_marks_existing_products_and_new_rows_default_to_non_demo(tmp_path):
    migration = product_demo_revision()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "product-demo.sqlite")))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE products (id CHAR(32) PRIMARY KEY)")
            connection.exec_driver_sql(
                "INSERT INTO products (id) VALUES "
                "('00000000000000000000000000000001'), "
                "('00000000000000000000000000000002')"
            )

            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()

            assert connection.exec_driver_sql(
                "SELECT id, is_demo FROM products ORDER BY id"
            ).all() == [
                ("00000000000000000000000000000001", 1),
                ("00000000000000000000000000000002", 1),
            ]
            connection.exec_driver_sql(
                "INSERT INTO products (id) VALUES ('00000000000000000000000000000003')"
            )
            assert connection.exec_driver_sql(
                "SELECT is_demo FROM products WHERE id = '00000000000000000000000000000003'"
            ).scalar_one() == 0

            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()

            assert "is_demo" not in {column["name"] for column in sa.inspect(connection).get_columns("products")}
    finally:
        engine.dispose()
