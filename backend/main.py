from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from trading_engine import TradingEngine
from models import PortfolioSummary, TradeSignal, TradeRequest, AnalysisMetrics

app = FastAPI(title="Quant Trading App")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = TradingEngine()

@app.get("/")
def read_root():
    return {"message": "Quant Trading API is running"}

@app.get("/api/portfolio", response_model=PortfolioSummary)
def get_portfolio():
    return engine.get_portfolio_summary()

@app.get("/api/price/{ticker}")
def get_price(ticker: str):
    price = engine.get_stock_price(ticker)
    return {"ticker": ticker, "price": price}

@app.post("/api/trade")
def trade(trade_request: TradeRequest):
    result = engine.execute_trade(trade_request)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.post("/api/strategy/{ticker}")
def run_strategy(ticker: str, quantity: int = 5):
    result = engine.run_strategy(ticker, quantity)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.post("/api/auto/start")
async def start_auto():
    await engine.start_auto_trading()
    return {"status": "started"}

@app.post("/api/auto/stop")
def stop_auto():
    engine.stop_auto_trading()
    return {"status": "stopped"}

@app.get("/api/auto/status")
def get_auto_status():
    return {"is_running": engine.is_running}

@app.get("/api/analysis", response_model=AnalysisMetrics)
def get_analysis():
    return engine.get_analysis()

from constants import INDIAN_STOCKS

@app.get("/api/stocks")
def get_stocks(q: str = ""):
    q = q.lower()
    if not q:
        return INDIAN_STOCKS[:10] # Return top 10 if no query
    
    filtered = [
        s for s in INDIAN_STOCKS 
        if q in s["symbol"].lower() or q in s["name"].lower()
    ]
    return filtered[:20]

