from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

# Fix for Vercel: Add current directory to sys.path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

app = FastAPI(title="Quant Trading App")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for lazy loading
engine = None
import_error = None

# Try to import dependencies safely
try:
    from trading_engine import TradingEngine
    from models import PortfolioSummary, TradeSignal, TradeRequest, AnalysisMetrics, BacktestResult
    from constants import INDIAN_STOCKS
except ImportError as e:
    import_error = str(e)
    print(f"Import Error: {e}")
except Exception as e:
    import_error = str(e)
    print(f"Startup Error: {e}")

def get_engine():
    global engine
    if import_error:
        raise HTTPException(status_code=500, detail=f"Server Startup Error: {import_error}")
    if engine is None:
        try:
            engine = TradingEngine()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Engine Init Error: {e}")
    return engine

@app.get("/")
def read_root():
    if import_error:
        return {"status": "error", "message": f"Startup failed: {import_error}"}
    return {"message": "Quant Trading API is running"}

@app.get("/api/debug")
def debug_status():
    return {
        "import_error": import_error,
        "engine_loaded": engine is not None
    }

@app.get("/api/portfolio", response_model=PortfolioSummary)
def get_portfolio():
    return get_engine().get_portfolio_summary()

@app.get("/api/price/{ticker}")
def get_price(ticker: str):
    price = get_engine().get_stock_price(ticker)
    return {"ticker": ticker, "price": price}

@app.post("/api/trade")
def trade(trade_request: TradeRequest):
    result = get_engine().execute_trade(trade_request)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.post("/api/strategy/{ticker}")
def run_strategy(ticker: str, quantity: int = 5):
    result = get_engine().run_strategy(ticker, quantity)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.post("/api/auto/start")
async def start_auto():
    await get_engine().start_auto_trading()
    return {"status": "started"}

@app.post("/api/auto/stop")
def stop_auto():
    get_engine().stop_auto_trading()
    return {"status": "stopped"}

@app.get("/api/auto/status")
def get_auto_status():
    return {"is_running": get_engine().is_running}

@app.get("/api/analysis", response_model=AnalysisMetrics)
def get_analysis():
    return get_engine().get_analysis()

@app.get("/api/backtest", response_model=BacktestResult)
def run_backtest(ticker: str = "RELIANCE.NS", months: int = 12, initial_capital: float = 100000.0):
    try:
        return get_engine().run_backtest(ticker=ticker, months=months, initial_capital=initial_capital)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/stocks")
def get_stocks(q: str = ""):
    if import_error:
        return []
    
    q = q.lower()
    if not q:
        return INDIAN_STOCKS[:10] # Return top 10 if no query
    
    filtered = [
        s for s in INDIAN_STOCKS 
        if q in s["symbol"].lower() or q in s["name"].lower()
    ]
    return filtered[:20]
