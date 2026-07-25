import os
import re
import tempfile
from datetime import datetime, timezone
from typing import Generator
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, ForeignKey
from sqlalchemy.engine.url import make_url, URL
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

load_dotenv()

RAW_DB_URL = os.getenv("DATABASE_URL", "")
DATABASE_URL = re.sub(r'[\r\n\t ]+', '', RAW_DB_URL)

def create_db_engine():
    if DATABASE_URL:
        try:
            clean_url = re.sub(r'[\r\n\t ]+', '', DATABASE_URL)
            parsed = make_url(clean_url)
            driver = "postgresql"
            if parsed.drivername.startswith("postgres"):
                driver = "postgresql"

            db_name = re.sub(r'[\r\n\t ]+', '', parsed.database) if parsed.database else "postgres"
            user_name = re.sub(r'[\r\n\t ]+', '', parsed.username) if parsed.username else None
            host_name = re.sub(r'[\r\n\t ]+', '', parsed.host) if parsed.host else None

            cleaned_url = URL.create(
                drivername=driver,
                username=user_name,
                password=parsed.password,
                host=host_name,
                port=parsed.port,
                database=db_name,
                query=parsed.query
            )

            eng = create_engine(cleaned_url, pool_pre_ping=True)
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

class PortfolioDB(Base):
    __tablename__ = "portfolios"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    cash = Column(Float, default=100000.0)

    user = relationship("UserDB", back_populates="portfolios")

class PositionDB(Base):
    __tablename__ = "positions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    average_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=False)

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

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database init warning: {e}")

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
