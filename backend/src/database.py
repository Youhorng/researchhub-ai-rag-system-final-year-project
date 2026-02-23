from collections.abc import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from src.config import get_settings

settings = get_settings()

# The engine is the core SQLAlchemy object that manages the actual
# database connections. It is created ONCE at module load time and reused.
#
# pool_pre_ping=True — before handing out a connection from the pool,
# SQLAlchemy sends a lightweight "SELECT 1" to check it's still alive.
# This prevents "connection closed" errors after the DB restarts or idles.
#
# pool_size=10 — keep up to 10 persistent connections in the pool.
# max_overflow=20 — allow up to 20 additional connections when pool is full.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.debug,  # if debug=True, log every SQL statement to stdout
)

# SessionLocal is a factory that creates new Session objects.
# Each HTTP request gets its own Session — this keeps transactions isolated
# between requests (one request's uncommitted changes don't affect another's).
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# get_db() is injected into FastAPI route handlers via Depends(get_db).
# It opens a Session at the start of the request and guarantees it's
# closed afterwards — even if an exception is raised.

# Usage in a route:
#   @router.get("/projects")
#   def list_projects(db: Session = Depends(get_db)):
#       return db.query(Project).all()

# The "yield" makes this a context manager — code before yield runs on
# request start, code after yield (finally block) runs after the response
# is sent.
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db           # FastAPI injects this session into the route
        db.commit()        # auto-commit if the route completed without error
    except Exception:
        db.rollback()      # undo any partial changes if something went wrong
        raise
    finally:
        db.close()         # always close the connection back to the pool


# Called by the /health endpoint and Docker healthcheck.
# Returns True if the DB is reachable, False otherwise.
def check_db_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
