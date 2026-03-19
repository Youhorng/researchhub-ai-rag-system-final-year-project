"""add openai_batch_id to papers

Revision ID: c3f8a1b2d4e6
Revises: a895d80525b0
Create Date: 2026-03-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f8a1b2d4e6'
down_revision: Union[str, Sequence[str], None] = 'a895d80525b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('papers', sa.Column('openai_batch_id', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('papers', 'openai_batch_id')
