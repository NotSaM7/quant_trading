from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class UserCreate(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class PortfolioPosition(BaseModel):
    ticker: str
    quantity: int
    average_price: float
    current_price: float
    pnl: float
    pnl_pct: float = 0.0
    todays_pnl: float = 0.0
    todays_pnl_pct: float = 0.0
    prev_close: float = 0.0
    stop_loss_price: Optional[float] = None
    atr: Optional[float] = None
    peak_price: Optional[float] = None           # Highest price reached while holding
    trailing_stop_price: Optional[float] = None  # Computed: peak - (2 × ATR14)

class PortfolioSummary(BaseModel):
    cash: float
    equity: float
    total_value: float
    todays_pnl: float = 0.0
    positions: List[PortfolioPosition]

class TradeRequest(BaseModel):
    ticker: str
    action: str  # "BUY" or "SELL"
    quantity: int

class TradeHistoryItem(BaseModel):
    id: str
    ticker: str
    action: str
    quantity: int
    price: float
    timestamp: datetime
    pnl: Optional[float] = None
    strategy: Optional[str] = "MANUAL"
    reason: Optional[str] = None

class AnalysisMetrics(BaseModel):
    total_pnl: float
    win_rate: float
    total_trades: int
    profit_factor: float
    trades: List[TradeHistoryItem]


class BacktestTrade(BaseModel):
    entry_date: str
    exit_date: str
    action: str
    entry_price: float
    exit_price: float
    quantity: int
    pnl: float
    pnl_pct: float
    exit_reason: str

class EquityCurvePoint(BaseModel):
    date: str
    equity: float
    close: float

class BacktestResult(BaseModel):
    ticker: str
    months: int
    initial_capital: float
    final_equity: float
    total_return_pct: float
    win_rate: float
    total_trades: int
    max_drawdown_pct: float
    sharpe_ratio: float
    trades: List[BacktestTrade]
    equity_curve: List[EquityCurvePoint]

