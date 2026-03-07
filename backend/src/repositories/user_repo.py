import logging
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from src.models.user import User, UserPreferences


# Configure logging
logger = logging.getLogger(__name__)


# Define a function fetch a user by their Clerk ID
def get_by_clerk_id(db: Session, clerk_id: str) -> User | None:
    return db.query(User).filter(User.clerk_id == clerk_id).first()


# Define a function to insert a new user or update their info
def upsert(
    db: Session,
    clerk_id: str,
    email: str | None,
    display_name: str | None,
    avatar_url: str | None,
) -> User:
    """
    Insert a new user or update their email/display_name/avatar_url if they
    already exist. Also creates a default UserPreferences row on first login.
    Returns the up-to-date User ORM object.
    """

    # Upsert the user row
    stmt = (
        insert(User)
        .values(
            clerk_id=clerk_id,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        .on_conflict_do_update(
            index_elements=["clerk_id"],
            set_={
                "email": email,
                "display_name": display_name,
                "avatar_url": avatar_url,
            },
        )
    )
    db.execute(stmt)
    db.commit()

    # Load the full ORM object so we have the id and created_at
    user = get_by_clerk_id(db, clerk_id)

    # Create default preferences if this is the first login
    if user and not db.query(UserPreferences).filter(UserPreferences.user_id == user.id).first():
        db.add(UserPreferences(user_id=user.id))
        db.commit()
        logger.info("Created default preferences for user %s", clerk_id)
        
    return user