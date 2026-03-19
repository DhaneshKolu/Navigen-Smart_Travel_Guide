"""Add budget, pace and trip_start_date to itineraries

Revision ID: 3d6d9f11b2c1
Revises: 1808f189740a
Create Date: 2026-03-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3d6d9f11b2c1"
down_revision: Union[str, Sequence[str], None] = "1808f189740a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("itineraries", sa.Column("budget", sa.Float(), nullable=True, server_default="0"))
    op.add_column("itineraries", sa.Column("pace", sa.String(), nullable=True, server_default="moderate"))
    op.add_column("itineraries", sa.Column("trip_start_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("itineraries", "trip_start_date")
    op.drop_column("itineraries", "pace")
    op.drop_column("itineraries", "budget")
