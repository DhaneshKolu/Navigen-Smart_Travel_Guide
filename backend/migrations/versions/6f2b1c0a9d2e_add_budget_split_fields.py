"""Add travel/hotel/food budget split fields to itineraries

Revision ID: 6f2b1c0a9d2e
Revises: 3d6d9f11b2c1
Create Date: 2026-03-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f2b1c0a9d2e"
down_revision: Union[str, Sequence[str], None] = "3d6d9f11b2c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("itineraries", sa.Column("travel_budget", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("itineraries", sa.Column("hotel_budget", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("itineraries", sa.Column("food_budget", sa.Integer(), nullable=True, server_default="0"))


def downgrade() -> None:
    op.drop_column("itineraries", "food_budget")
    op.drop_column("itineraries", "hotel_budget")
    op.drop_column("itineraries", "travel_budget")
