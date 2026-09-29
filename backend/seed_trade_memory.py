"""
Seed Trade Memory Script — Ingests 12-month historical backtests into Supabase pgvector trade memory.
"""

import sys
import os
import time
from pathlib import Path
from dotenv import load_dotenv

# Ensure backend directory is in path and env is loaded
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

load_dotenv(backend_dir / ".env")

from database import init_db, SessionLocal, TradeEpisodeDB
from trading_engine import TradingEngine
from constants import INDIAN_STOCKS
from rag_memory import store_trade_episode, classify_market_regime

# Top liquid stocks to seed
SEED_TICKERS = [
    "RELIANCE.NS",
    "TCS.NS",
    "HDFCBANK.NS",
    "INFY.NS",
    "ICICIBANK.NS",
    "BHARTIARTL.NS",
    "SBIN.NS",
    "LT.NS",
    "TITAN.NS",
    "HCLTECH.NS",
    "WIPRO.NS",
    "MARUTI.NS",
]


def seed_memory():
    print("=" * 60)
    print("  SEEDING QUANT EPISODIC TRADE MEMORY (SUPABASE PGVECTOR)")
    print("=" * 60)

    init_db()
    db = SessionLocal()
    engine = TradingEngine()

    total_inserted = 0
    start_time = time.time()

    for ticker in SEED_TICKERS:
        print(f"\n[+] Running 12mo backtest for {ticker}...")
        try:
            result = engine.run_backtest(ticker=ticker, months=12)
            trades = result.trades
            print(f"    Found {len(trades)} historical trades for {ticker}")

            for t in trades:
                # Check if this exact trade already exists in DB
                existing = db.query(TradeEpisodeDB).filter(
                    TradeEpisodeDB.ticker == ticker,
                    TradeEpisodeDB.entry_date == t.entry_date,
                    TradeEpisodeDB.exit_date == t.exit_date,
                ).first()

                if existing:
                    continue

                sma_gap = t.sma_gap_pct if t.sma_gap_pct is not None else 0.0
                rsi = t.rsi14 if t.rsi14 is not None else 50.0
                atr_pct = t.atr_pct if t.atr_pct is not None else 2.0
                regime = t.market_regime or classify_market_regime(sma_gap, rsi, atr_pct)

                trade_data = {
                    "ticker": ticker,
                    "entry_date": t.entry_date,
                    "exit_date": t.exit_date,
                    "action": t.action,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "quantity": t.quantity,
                    "pnl": t.pnl,
                    "pnl_pct": t.pnl_pct,
                    "exit_reason": t.exit_reason,
                    "sma_gap_pct": sma_gap,
                    "rsi14": rsi,
                    "atr_pct": atr_pct,
                    "market_regime": regime,
                }

                store_trade_episode(trade_data, db=db)
                total_inserted += 1
                print(f"      - Seeded: {t.entry_date} -> {t.exit_date} | {regime} | {t.pnl_pct:+.1f}% ({t.exit_reason})")
                time.sleep(0.1)  # Rate limiting courtesy for embedding API

        except Exception as e:
            print(f"    [!] Error backtesting {ticker}: {e}")

    db.close()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"  SEEDING COMPLETE: {total_inserted} new trade episodes stored.")
    print(f"  Time taken: {elapsed:.1f} seconds")
    print("=" * 60)


if __name__ == "__main__":
    seed_memory()
