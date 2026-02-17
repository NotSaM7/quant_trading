from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class StockData(BaseModel):
    ticker: str
    price: float
    timestamp: datetime

class TradeSignal(BaseModel):
    ticker: str
    action: str  # "BUY", "SELL", "HOLD"
    price: float
    timestamp: datetime
    reason: str

class PortfolioPosition(BaseModel):
    ticker: str
    quantity: int
    average_price: float
    current_price: float
    pnl: float

class PortfolioSummary(BaseModel):
    cash: float
    equity: float
    total_value: float
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

class AnalysisMetrics(BaseModel):
    total_pnl: float
    win_rate: float
    total_trades: int
    profit_factor: float
    trades: List[TradeHistoryItem]
