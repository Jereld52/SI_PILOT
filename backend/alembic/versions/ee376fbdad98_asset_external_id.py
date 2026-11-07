"""asset external id

Revision ID: ee376fbdad98
Revises: 631419a4bab1
Create Date: 2026-11-07 23:23:14.931042

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee376fbdad98'
down_revision: Union[str, Sequence[str], None] = '631419a4bab1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assets', sa.Column('external_id', sa.String(length=120), nullable=True))
    op.create_index(op.f('ix_assets_external_id'), 'assets', ['external_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_assets_external_id'), table_name='assets')
    op.drop_column('assets', 'external_id')
