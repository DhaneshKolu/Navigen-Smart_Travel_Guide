"""Add name and preferences to users

Revision ID: 9b8d7a6c5e4f
Revises: 6f2b1c0a9d2e
Create Date: 2026-03-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9b8d7a6c5e4f"
down_revision: Union[str, Sequence[str], None] = "6f2b1c0a9d2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("preferences", sa.JSON(), nullable=True, server_default=sa.text("'{}'")))


def downgrade() -> None:
    op.drop_column("users", "preferences")
    op.drop_column("users", "name")
