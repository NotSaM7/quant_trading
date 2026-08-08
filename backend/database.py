import os
import re
import tempfile
from datetime import datetime, timezone
from typing import Generator
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, ForeignKey, text, UniqueConstraint
from sqlalchemy.engine.url import make_url, URL
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

load_dotenv()

RAW_DB_URL = os.getenv("DATABASE_URL", "")

def sanitize_url(raw: str) -> str:
    return re.sub(r'[\r\n\t ]+', '', raw.replace("\\n", "").replace("\\r", "").strip()) if raw else ""

DATABASE_URL = sanitize_url(RAW_DB_URL)

def create_db_engine():
    if DATABASE_URL:
        try:
            parsed = make_url(DATABASE_URL)
            cleaned_url = URL.create(
                drivername="postgresql",
                username=parsed.username,
                password=parsed.password,
                host=parsed.host,
                port=parsed.port,
                database="postgres",
                query=parsed.query
            )


            eng = create_engine(
                cleaned_url,
                pool_pre_ping=True,
                pool_size=15,          # max persistent connections per process
                max_overflow=15,       # burst connections (total: 30 per process)
                pool_timeout=30,       # seconds to wait for a free connection
                pool_recycle=300,      # recycle connections every 5 minutes to prevent cloud firewall drops
                connect_args={
                    "connect_timeout": 10,  # fail fast if Supabase is unreachable
                    "keepalives": 1,        # enable TCP keepalives
                    "keepalives_idle": 30,  # send keepalive packet after 30s idle
                    "keepalives_interval": 10,
                    "keepalives_count": 5,
                },
            )
            return eng
        except Exception as e:
            print(f"Postgres Connection Warning: {e}, falling back to SQLite")

    # Local / Fallback SQLite Database
    DB_DIR = os.path.join(tempfile.gettempdir(), "quant_trading_data")
    os.makedirs(DB_DIR, exist_ok=True)
    DB_PATH = os.path.join(DB_DIR, "quant_trading.db")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
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

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database init warning: {e}")

    # Safe migrations: add new columns to existing tables without losing data
    for col_sql in [
        "ALTER TABLE positions ADD COLUMN peak_price FLOAT",
        "ALTER TABLE positions ADD COLUMN trailing_stop_price FLOAT",
    ]:
        try:
            with engine.connect() as conn:
                conn.execute(text(col_sql))
                conn.commit()
        except Exception:
            pass  # Column already exists — safe to ignore

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
