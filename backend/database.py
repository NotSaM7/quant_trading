import os
import re
import ssl
import tempfile
from datetime import datetime, timezone
from typing import Generator
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, ForeignKey, text, UniqueConstraint
from sqlalchemy.engine.url import make_url, URL
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

from pathlib import Path
from dotenv import load_dotenv

# Ensure .env in backend directory is loaded
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()

try:
    from pgvector.sqlalchemy import Vector
    HAS_PGVECTOR = True
except ImportError:
    HAS_PGVECTOR = False

RAW_DB_URL = os.getenv("DATABASE_URL", "")

def sanitize_url(raw: str) -> str:
    return re.sub(r'[\r\n\t ]+', '', raw.replace("\\n", "").replace("\\r", "").strip()) if raw else ""

DATABASE_URL = sanitize_url(RAW_DB_URL)

DB_ENGINE_DRIVER = "none"
DB_ENGINE_ERROR = None

def create_db_engine():
    global DB_ENGINE_DRIVER, DB_ENGINE_ERROR
    if DATABASE_URL:
        # First attempt: Try pure-python pg8000 driver (100% reliable in Vercel serverless / AWS Lambda Linux)
        try:
            parsed = make_url(DATABASE_URL)
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

            url_pg8000 = URL.create(
                drivername="postgresql+pg8000",
                username=parsed.username,
                password=parsed.password,
                host=parsed.host,
                port=parsed.port or 6543,
                database="postgres",
            )
            eng = create_engine(
                url_pg8000,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=10,
                pool_timeout=30,
                pool_recycle=300,
                connect_args={"ssl_context": ssl_ctx, "timeout": 10},
            )
            with eng.connect() as conn:
                pass
            DB_ENGINE_DRIVER = "postgresql+pg8000"
            DB_ENGINE_ERROR = None
            print("Successfully connected to Supabase PostgreSQL using pg8000!")
            return eng
        except Exception as e_pg8000:
            print(f"pg8000 connection warning: {e_pg8000}, trying psycopg2...")
            DB_ENGINE_ERROR = f"pg8000 error: {e_pg8000}"

        # Second attempt: Try psycopg2 driver with sslmode=require
        try:
            parsed = make_url(DATABASE_URL)
            q = dict(parsed.query)
            if "sslmode" not in q:
                q["sslmode"] = "require"

            url_psycopg2 = URL.create(
                drivername="postgresql",
                username=parsed.username,
                password=parsed.password,
                host=parsed.host,
                port=parsed.port or 6543,
                database="postgres",
                query=q,
            )
            eng = create_engine(
                url_psycopg2,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=10,
                pool_timeout=30,
                pool_recycle=300,
                connect_args={
                    "connect_timeout": 10,
                    "keepalives": 1,
                    "keepalives_idle": 30,
                    "keepalives_interval": 10,
                    "keepalives_count": 5,
                },
            )
            with eng.connect() as conn:
                pass
            DB_ENGINE_DRIVER = "postgresql+psycopg2"
            DB_ENGINE_ERROR = None
            print("Successfully connected to Supabase PostgreSQL using psycopg2!")
            return eng
        except Exception as e_psycopg2:
            print(f"psycopg2 connection warning: {e_psycopg2}, falling back to SQLite")
            DB_ENGINE_ERROR = f"{DB_ENGINE_ERROR} | psycopg2 error: {e_psycopg2}"

    # Local / Fallback SQLite Database
    DB_ENGINE_DRIVER = "sqlite"
    DB_DIR = os.path.join(tempfile.gettempdir(), "quant_trading_data")
    os.makedirs(DB_DIR, exist_ok=True)
    DB_PATH = os.path.join(DB_DIR, "quant_trading.db")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
    print(f"Using fallback SQLite database at {DB_PATH}")
    return create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    portfolios = relationship("PortfolioDB", back_populates="user", cascade="all, delete-orphan")
    positions = relationship("PositionDB", back_populates="user", cascade="all, delete-orphan")
    trades = relationship("TradeDB", back_populates="user", cascade="all, delete-orphan")
    research_logs = relationship("AgentResearchLogDB", back_populates="user", cascade="all, delete-orphan")

class PortfolioDB(Base):
    __tablename__ = "portfolios"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    cash = Column(Float, default=100000.0)

    user = relationship("UserDB", back_populates="portfolios")

class PositionDB(Base):
    __tablename__ = "positions"
    __table_args__ = (UniqueConstraint('user_id', 'ticker', name='unique_user_ticker'),)

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    average_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=False)
    peak_price = Column(Float, nullable=True)           # Highest price seen while holding (trailing stop tracks this)
    trailing_stop_price = Column(Float, nullable=True)  # Computed: peak_price - (2 × ATR14)

    user = relationship("UserDB", back_populates="positions")

class TradeDB(Base):
    __tablename__ = "trades"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    action = Column(String, nullable=False) # BUY / SELL
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    pnl = Column(Float, nullable=True)
    strategy = Column(String, default="MANUAL")
    reason = Column(String, nullable=True)

    user = relationship("UserDB", back_populates="trades")

class AgentResearchLogDB(Base):
    __tablename__ = "agent_research_logs"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)  # Nullable for guest research
    ticker = Column(String, nullable=False, index=True)
    recommendation = Column(String, nullable=False)  # BUY / HOLD / SELL
    confidence = Column(String, default="MEDIUM")     # HIGH / MEDIUM / LOW
    summary = Column(String, nullable=False)          # Full final text response
    trace_json = Column(String, nullable=False)       # JSON string of structured tool steps
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("UserDB", back_populates="research_logs")

class TradeEpisodeDB(Base):
    __tablename__ = "trade_episodes"

    id = Column(String, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)
    entry_date = Column(String, nullable=False)
    exit_date = Column(String, nullable=False)
    action = Column(String, nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    pnl = Column(Float, nullable=False)
    pnl_pct = Column(Float, nullable=False)
    exit_reason = Column(String, nullable=False)
    sma_gap_pct = Column(Float, nullable=False)
    rsi14 = Column(Float, nullable=False)
    atr_pct = Column(Float, nullable=False)
    market_regime = Column(String, nullable=False, index=True)
    reflection_text = Column(String, nullable=False)
    embedding = Column(Vector(768) if (HAS_PGVECTOR and engine.dialect.name == "postgresql") else String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

def init_db():
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "postgresql":
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                    conn.commit()
                except Exception as e:
                    print(f"pgvector extension init warning: {e}")

            Base.metadata.create_all(bind=conn)
            conn.commit()

            # Safe migrations: add new columns/indexes to existing tables without losing data
            safe_statements = [
                "ALTER TABLE positions ADD COLUMN peak_price FLOAT",
                "ALTER TABLE positions ADD COLUMN trailing_stop_price FLOAT",
            ]
            if engine.dialect.name == "postgresql":
                safe_statements.append("CREATE INDEX IF NOT EXISTS idx_trade_episodes_embedding ON trade_episodes USING hnsw (embedding vector_cosine_ops)")

            for col_sql in safe_statements:
                try:
                    conn.execute(text(col_sql))
                    conn.commit()
                except Exception:
                    pass  # Already exists — safe to ignore
    except Exception as e:
        print(f"Database init warning: {e}")

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
