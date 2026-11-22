"""Marketplace approval migration backfill and SQLite execution."""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def marketplace_revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261121_0033_marketplace_approval_flows.py"
    spec = importlib.util.spec_from_file_location("marketplace_approval_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("20261121_0033", "20261120_0032")
    return module


def test_marketplace_upgrade_backfills_only_single_offer_variants(tmp_path):
    migration = marketplace_revision()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "marketplace.sqlite")))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE products (id CHAR(32) PRIMARY KEY, "
                "reservation_minimum_reached_at DATETIME, reservations_open BOOLEAN)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE supplier_offers (id CHAR(32) PRIMARY KEY, "
                "variant_id CHAR(32), cost_amount INTEGER, lead_time_days INTEGER)"
            )
            connection.exec_driver_sql("CREATE TABLE suppliers (id CHAR(32) PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE customers (id CHAR(32) PRIMARY KEY)")
            connection.exec_driver_sql(
                "INSERT INTO products VALUES "
                "('00000000000000000000000000000001', '2026-11-20', 1), "
                "('00000000000000000000000000000002', NULL, 1)"
            )
            connection.exec_driver_sql(
                "INSERT INTO supplier_offers VALUES "
                "('00000000000000000000000000000011', '00000000000000000000000000000021', 500, 3), "
                "('00000000000000000000000000000012', '00000000000000000000000000000022', 500, 3), "
                "('00000000000000000000000000000013', '00000000000000000000000000000022', 300, 2)"
            )

            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()

            assert connection.exec_driver_sql(
                "SELECT id, is_primary FROM supplier_offers ORDER BY id"
            ).all() == [
                ("00000000000000000000000000000011", 1),
                ("00000000000000000000000000000012", 0),
                ("00000000000000000000000000000013", 0),
            ]
            assert connection.exec_driver_sql(
                "SELECT id, production_status, reservations_open FROM products ORDER BY id"
            ).all() == [
                ("00000000000000000000000000000001", "target_reached", 0),
                ("00000000000000000000000000000002", "collecting", 1),
            ]
            assert "supplier_offer_change_requests" in sa.inspect(connection).get_table_names()
    finally:
        engine.dispose()
