import sys
import os
import uuid
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Fix for Vercel: Add current directory to sys.path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import init_db, get_db, UserDB, PortfolioDB, engine as db_engine
from security import hash_password, verify_password, create_access_token, decode_access_token
from models import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    PortfolioSummary, TradeRequest, AnalysisMetrics, BacktestResult
)
from constants import INDIAN_STOCKS
from trading_engine import TradingEngine

app = FastAPI(title="Quant Trading App")

# Initialize database schema safely — run in a thread with timeout
# so Supabase connection issues never freeze uvicorn startup
import threading
def _startup_init_db():
    try:
        init_db()
    except Exception as e:
        print(f"Startup DB init warning: {e}")

_db_init_thread = threading.Thread(target=_startup_init_db, daemon=True)
_db_init_thread.start()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

trading_engine_instance = TradingEngine()

def get_current_user_optional(authorization: str = Header(None), db: Session = Depends(get_db)) -> Optional[UserResponse]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user_id = payload["sub"]
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        return None
    return UserResponse(id=user.id, name=user.name, email=user.email)

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> UserResponse:
    user = get_current_user_optional(authorization, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    return user

@app.get("/")
def read_root():
    return {"message": "Quant Trading API is running"}

@app.get("/api/debug")
@app.get("/debug")
def debug_status():
    db_url = os.getenv("DATABASE_URL", "")
    return {
        "has_database_url": bool(db_url),
        "database_url_prefix": db_url[:30] if db_url else "NONE (USING SQLITE)",
        "active_engine_url": str(db_engine.url) if db_engine else "NONE"
    }

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register", response_model=TokenResponse)
@app.post("/auth/register", response_model=TokenResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(UserDB).filter(UserDB.email == user_data.email.lower().strip()).first()
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")

        user_id = str(uuid.uuid4())
        hashed_pwd = hash_password(user_data.password)

        new_user = UserDB(
            id=user_id,
            email=user_data.email.lower().strip(),
            hashed_password=hashed_pwd,
            name=user_data.name.strip()
        )
        new_portfolio = PortfolioDB(
            id=str(uuid.uuid4()),
            user_id=user_id,
            cash=100000.0
        )

        db.add(new_user)
        db.add(new_portfolio)
        db.commit()
        db.refresh(new_user)

        user_res = UserResponse(id=new_user.id, name=new_user.name, email=new_user.email)
        token = create_access_token({"sub": new_user.id, "email": new_user.email})
        return TokenResponse(access_token=token, user=user_res)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration Error: {str(e)}")

@app.post("/api/auth/login", response_model=TokenResponse)
@app.post("/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    try:
        user = db.query(UserDB).filter(UserDB.email == credentials.email.lower().strip()).first()
        if not user or not verify_password(credentials.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect email or password")

        user_res = UserResponse(id=user.id, name=user.name, email=user.email)
        token = create_access_token({"sub": user.id, "email": user.email})
        return TokenResponse(access_token=token, user=user_res)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login Error: {str(e)}")

@app.get("/api/auth/me", response_model=UserResponse)
@app.get("/auth/me", response_model=UserResponse)
def get_me(current_user: UserResponse = Depends(get_current_user)):
    return current_user

# --- PORTFOLIO & TRADING ENDPOINTS ---

@app.get("/api/portfolio", response_model=PortfolioSummary)
@app.get("/portfolio", response_model=PortfolioSummary)
def get_portfolio(current_user: Optional[UserResponse] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    user_id = current_user.id if current_user else None
    return trading_engine_instance.get_portfolio_summary_db(db, user_id=user_id)

@app.get("/api/price/{ticker}")
@app.get("/price/{ticker}")
def get_price(ticker: str):
    price = trading_engine_instance.get_stock_price(ticker)
    return {"ticker": ticker, "price": price}

@app.post("/api/trade")
@app.post("/trade")
def trade(trade_request: TradeRequest, current_user: Optional[UserResponse] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    user_id = current_user.id if current_user else None
    result = trading_engine_instance.execute_trade_db(trade_request, db=db, user_id=user_id)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.post("/api/strategy/{ticker}")
@app.post("/strategy/{ticker}")
def run_strategy(ticker: str, quantity: int = 5):
    result = trading_engine_instance.run_strategy(ticker, quantity)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.post("/api/auto/start")
@app.post("/auto/start")
async def start_auto(current_user: UserResponse = Depends(get_current_user)):
    await trading_engine_instance.start_auto_trading(user_id=current_user.id)
    return {"status": "started", "user_id": current_user.id}

@app.post("/api/auto/stop")
@app.post("/auto/stop")
def stop_auto():
    trading_engine_instance.stop_auto_trading()
    return {"status": "stopped"}

@app.post("/api/auto/scan")
@app.post("/auto/scan")
def auto_scan(current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        result = trading_engine_instance.run_auto_cycle_db(db, user_id=current_user.id)
        return result
    except Exception as e:
        import traceback
        return {"status": "error", "detail": str(e), "trace": traceback.format_exc()}

@app.get("/api/auto/status")
@app.get("/auto/status")
def get_auto_status():
    return {"is_running": trading_engine_instance.is_running}

@app.get("/api/analysis", response_model=AnalysisMetrics)
@app.get("/analysis", response_model=AnalysisMetrics)
def get_analysis(current_user: Optional[UserResponse] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    user_id = current_user.id if current_user else None
    return trading_engine_instance.get_analysis_db(db, user_id=user_id)

@app.get("/api/backtest", response_model=BacktestResult)
@app.get("/backtest", response_model=BacktestResult)
def run_backtest(ticker: str = "RELIANCE.NS", months: int = 12, initial_capital: float = 100000.0):
    try:
        return trading_engine_instance.run_backtest(ticker=ticker, months=months, initial_capital=initial_capital)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/stocks")
@app.get("/stocks")
def get_stocks(q: str = ""):
    q_strip = q.strip().upper()
    if not q_strip:
        return INDIAN_STOCKS[:10]
    
    q_lower = q_strip.lower()
    filtered = [
        s for s in INDIAN_STOCKS 
        if q_lower in s["symbol"].lower() or q_lower in s["name"].lower()
    ]

    # If user typed something specific that isn't directly in our list, add it as a dynamic option
    formatted_ticker = q_strip if q_strip.endswith(".NS") or q_strip.endswith(".BO") else f"{q_strip}.NS"
    has_exact = any(s["symbol"].upper() == formatted_ticker for s in filtered)
    
    if not has_exact and len(q_strip) >= 2:
        filtered.insert(0, {"symbol": formatted_ticker, "name": f"{q_strip} (NSE Stock)"})
        
    return filtered[:20]

@app.post("/api/book-profit")
@app.post("/book-profit")
def book_profit(
    db: Session = Depends(get_db),
    current_user: Optional[UserResponse] = Depends(get_current_user_optional)
):
    user_id = current_user.id if current_user else None
    return trading_engine_instance.book_profit_db(db, user_id=user_id)

