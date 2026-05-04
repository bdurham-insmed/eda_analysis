"""
Shared SQLAlchemy engine for the api_server FastAPI app.
"""

import os

from sqlalchemy import create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db/postgres")
engine = create_engine(DATABASE_URL)
