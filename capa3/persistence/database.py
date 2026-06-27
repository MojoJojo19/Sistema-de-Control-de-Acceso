"""
Database Engine — §6.3.4.1

SQLAlchemy engine con pool de conexiones.
Configurable: SQLite (desarrollo) u Oracle (producción) vía DATABASE_URL.

Spec §6.3.4.1:
    Motor: Oracle Database
    Driver: oracledb (thin driver)
    ORM: SQLAlchemy >= 2.0 con dialect Oracle
    Pool: pool_size=5, max_overflow=10
"""

import logging

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

from capa3.config import DATABASE_URL, DB_MAX_OVERFLOW, DB_POOL_SIZE

logger = logging.getLogger(__name__)

# Engine global — singleton
_engine = None
_SessionFactory = None


def get_engine():
    """Retorna el engine de SQLAlchemy (singleton)."""
    global _engine
    if _engine is None:
        is_sqlite = DATABASE_URL.startswith("sqlite")

        if is_sqlite:
            _engine = create_engine(
                DATABASE_URL,
                echo=False,
                connect_args={"check_same_thread": False},
            )
            # Habilitar WAL mode para mejor concurrencia en SQLite
            @event.listens_for(_engine, "connect")
            def set_sqlite_pragma(dbapi_conn, connection_record):
                cursor = dbapi_conn.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()
        else:
            # Oracle o cualquier otro motor — §6.3.4.1
            _engine = create_engine(
                DATABASE_URL,
                pool_size=DB_POOL_SIZE,
                max_overflow=DB_MAX_OVERFLOW,
                echo=False,
            )

        logger.info(
            "Database engine creado: %s (pool_size=%d, max_overflow=%d)",
            "SQLite" if is_sqlite else DATABASE_URL.split("://")[0],
            DB_POOL_SIZE if not is_sqlite else 0,
            DB_MAX_OVERFLOW if not is_sqlite else 0,
        )

    return _engine


def get_session_factory() -> sessionmaker:
    """Retorna el factory de sesiones SQLAlchemy."""
    global _SessionFactory
    if _SessionFactory is None:
        _SessionFactory = sessionmaker(bind=get_engine())
    return _SessionFactory


def get_session() -> Session:
    """Crea y retorna una sesión nueva."""
    factory = get_session_factory()
    return factory()
