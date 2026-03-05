from collections.abc import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from src.config import get_settings


# Get the config settings 
settings = get_settings()

# Create the engine to build connection pool
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.debug,
)

# Create the factory class for creating sessions
SessionLocal = sessionmaker(
    # Tell the factory which engine to use
    bind=engine, 
    autocommit=False,
    autoflush=False,
)


# Get the database connection
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close() 


# Test the database connection
def check_db_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

