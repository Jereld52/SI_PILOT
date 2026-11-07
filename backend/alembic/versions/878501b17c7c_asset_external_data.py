"""asset external data

Revision ID: 878501b17c7c
Revises: 56d166a72818
Create Date: 2026-11-07 23:58:27.082597

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '878501b17c7c'
down_revision: Union[str, Sequence[str], None] = '56d166a72818'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assets', sa.Column('external_data_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('assets', 'external_data_json')
