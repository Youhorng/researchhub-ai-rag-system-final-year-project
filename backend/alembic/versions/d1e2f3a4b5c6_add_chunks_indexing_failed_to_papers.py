"""add chunks_indexing_failed to papers

Revision ID: d1e2f3a4b5c6
Revises: c3f8a1b2d4e6
Create Date: 2026-04-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c3f8a1b2d4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('papers', sa.Column(
        'chunks_indexing_failed',
        sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    ))


def downgrade() -> None:
    op.drop_column('papers', 'chunks_indexing_failed')
