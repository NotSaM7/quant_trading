import logging
import time
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import asyncio
import uuid
import os
import tempfile
from database import UserDB, PortfolioDB, PositionDB, TradeDB
from models import (
    StockData, PortfolioPosition, PortfolioSummary, TradeSignal, TradeRequest,
    TradeHistoryItem, AnalysisMetrics, BacktestTrade, BacktestResult
)
from constants import INDIAN_STOCKS

# Suppress all yfinance noise including misleading "possibly delisted" warnings
logging.getLogger("yfinance").setLevel(logging.CRITICAL)
logging.getLogger("yfinance.base").setLevel(logging.CRITICAL)
logging.getLogger("yfinance.cache").setLevel(logging.CRITICAL)

DATA_FILE = os.path.join(tempfile.gettempdir(), "trade_history.json")

try:
    yf.set_tz_cache_location(os.path.join(tempfile.gettempdir(), "yf_cache"))
except Exception as e:
    print(f"Warning: Could not set yfinance cache location: {e}")


def _fetch_history(
    ticker: str,
    period: str = "3mo",
    interval: str = "1d",
    retries: int = 3,
    delay: float = 1.5,
) -> Optional[pd.DataFrame]:
    """
    Robust wrapper around yf.Ticker.history() with:
      - Retry logic (handles transient Yahoo Finance Redis/server errors)
      - Fallback to explicit start/end date range when period-based fetch fails
      - Silent on all yfinance log noise
    Returns a DataFrame or None if all attempts fail.
    """
    # Map period strings to approximate day counts for the date-range fallback
    _period_days = {"1d": 1, "5d": 5, "1mo": 31, "3mo": 92, "6mo": 183, "1y": 365, "2y": 730}
    days = _period_days.get(period, 92)

    attempts = [
        dict(period=period, interval=interval, raise_errors=False),
        # Fallback 1: try a slightly longer period (sometimes fixes Redis cache misses)
        dict(period="6mo", interval=interval, raise_errors=False),
        # Fallback 2: explicit date range (bypasses Yahoo's period-key caching)
        dict(
            start=(datetime.today() - timedelta(days=days + 10)).strftime("%Y-%m-%d"),
            end=datetime.today().strftime("%Y-%m-%d"),
            interval=interval,
            raise_errors=False,
        ),
    ]

    last_exc = None
    for attempt_idx, kwargs in enumerate(attempts):
        for retry in range(retries):
            try:
                t = yf.Ticker(ticker)
                df = t.history(**kwargs)
                if df is not None and not df.empty:
                    return df
            except Exception as exc:
                last_exc = exc
            if retry < retries - 1:
                time.sleep(delay * (retry + 1))
        # Small gap between different fallback strategies
        if attempt_idx < len(attempts) - 1:
            time.sleep(delay)

    if last_exc:
        print(f"[_fetch_history] All attempts failed for {ticker}: {last_exc}")
    return None

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df['High']
    low = df['Low']
    close = df['Close']
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean()

def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss.replace(0, 1e-9))
    return 100 - (100 / (1 + rs))

def generate_trade_summary(ticker: str, action: str, qty: int = 1, price: float = 0.0, sma5: float = 0.0, sma20: float = 0.0, rsi: float = 50.0, atr_pct: Optional[float] = None) -> str:
    sym = ticker.replace(".NS", "")
    sma20_safe = sma20 if sma20 > 0 else (price if price > 0 else 1.0)
    sma_gap_pct = abs(sma5 - sma20_safe) / sma20_safe * 100

    if action == "BUY":
        # Trend strength
        if sma_gap_pct > 3:
            trend = "a strong short-term uptrend"
        elif sma_gap_pct > 1:
            trend = "a moderate upward trend"
        else:
            trend = "an early-stage upward crossover"

        # RSI-based momentum description
        if rsi >= 70:
            momentum = f"momentum is very strong (RSI {rsi:.1f}), though nearing overbought territory"
        elif rsi >= 50:
            momentum = f"buying momentum is healthy (RSI {rsi:.1f})"
        else:
            momentum = f"momentum is just starting to build (RSI {rsi:.1f})"

        rationale = f"{sym} showed {trend} (5-day avg {sma_gap_pct:.1f}% above 20-day avg), and {momentum}."

    elif action == "SELL":
        if sma_gap_pct > 3:
            trend = "a sharp short-term downturn"
        elif sma_gap_pct > 1:
            trend = "a moderate downward crossover"
        else:
            trend = "a weakening trend"

        if rsi <= 30:
            momentum = f"selling pressure is heavy (RSI {rsi:.1f}), signaling oversold conditions"
        elif rsi <= 50:
            momentum = f"momentum has turned negative (RSI {rsi:.1f})"
        else:
            momentum = f"strength is fading despite RSI still at {rsi:.1f}"

        rationale = f"{sym} showed {trend} (5-day avg {sma_gap_pct:.1f}% below 20-day avg), and {momentum}. Position closed to limit downside."
    else:
        rationale = f"{sym} is currently moving sideways with balanced momentum."

    if atr_pct and atr_pct > 2.5:
        rationale += f" Volatility was elevated (ATR {atr_pct:.1f}%), so position size was adjusted accordingly."

    return rationale

_PRICE_CACHE: Dict[str, Any] = {}
_CACHE_TTL_SECONDS = 15.0

class TradingEngine:
    def __init__(self, initial_cash: float = 100000.0):
        self.cash = initial_cash
        self.positions: Dict[str, PortfolioPosition] = {}
        self.history: List[TradeHistoryItem] = []
        self.is_running = False
        self.auto_user_id: Optional[str] = None       # Stored when Start Bot is clicked
        self.stop_loss_pct = 0.03                      # Used for position sizing only (not for stop-loss trigger)
        self.trailing_multiplier = 2.0                 # Trailing stop = 2 × ATR14 below peak price
        self.risk_per_trade_pct = 0.02  # 2.0% equity risk per trade
        self._trade_lock = __import__('threading').Lock()  # Prevents concurrent auto-cycles from double-spending
        self.load_history()

    def load_history(self):
        try:
            with open(DATA_FILE, "r") as f:
                data = json.load(f)
                valid_items = []
                for item in data:
                    try:
                        valid_items.append(TradeHistoryItem(**item))
                    except Exception as err:
                        print(f"Skipping legacy history item: {err}")
                self.history = valid_items
        except Exception as e:
            print(f"Error loading history: {e}")
            self.history = []

    def save_history(self):
        try:
            with open(DATA_FILE, "w") as f:
                json.dump([item.dict() for item in self.history], f, default=str)
        except Exception as e:
            print(f"Error saving history: {e}")

    def get_analysis_db(self, db: Session, user_id: Optional[str] = None) -> AnalysisMetrics:
        portfolio = self._get_or_create_portfolio(db, user_id=user_id)
        if not portfolio:
            return AnalysisMetrics(total_pnl=0.0, win_rate=0.0, total_trades=0, profit_factor=0.0, trades=[])

        db_trades = db.query(TradeDB).filter(TradeDB.user_id == portfolio.user_id).order_by(TradeDB.timestamp.desc()).all()

        trade_items = []
        for t in db_trades:
            trade_items.append(TradeHistoryItem(
                id=t.id,
                ticker=t.ticker,
                action=t.action,
                quantity=t.quantity,
                price=t.price,
                timestamp=t.timestamp,
                pnl=t.pnl,
                strategy=t.strategy,
                reason=t.reason
            ))

        total_pnl = sum(item.pnl for item in trade_items if item.pnl is not None)
        total_trades = len(trade_items)
        winning_trades = len([item for item in trade_items if item.pnl and item.pnl > 0])
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0

        gross_profit = sum(item.pnl for item in trade_items if item.pnl and item.pnl > 0)
        gross_loss = abs(sum(item.pnl for item in trade_items if item.pnl and item.pnl < 0))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)

        return AnalysisMetrics(
            total_pnl=total_pnl,
            win_rate=win_rate,
            total_trades=total_trades,
            profit_factor=profit_factor,
            trades=trade_items
        )

    def get_analysis(self) -> AnalysisMetrics:
        total_pnl = sum(item.pnl for item in self.history if item.pnl is not None)
        total_trades = len(self.history)
        winning_trades = len([item for item in self.history if item.pnl and item.pnl > 0])
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0

        gross_profit = sum(item.pnl for item in self.history if item.pnl and item.pnl > 0)
        gross_loss = abs(sum(item.pnl for item in self.history if item.pnl and item.pnl < 0))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0)

        return AnalysisMetrics(
            total_pnl=total_pnl,
            win_rate=win_rate,
            total_trades=total_trades,
            profit_factor=profit_factor,
            trades=sorted(self.history, key=lambda x: x.timestamp, reverse=True)
        )

    def get_stock_price(self, ticker: str) -> float:
        try:
            history = _fetch_history(ticker, period="1d", retries=2, delay=1.0)
            if history is not None and not history.empty and 'Close' in history:
                val = float(history['Close'].iloc[-1])
                return val if not pd.isna(val) and val > 0 else 0.0
        except Exception:
            pass
        return 0.0

    def get_stock_price_and_prev_close(self, ticker: str) -> tuple:
        """Returns (current_price, previous_close_price) tuple with fast_info & 15s TTL caching."""
        now = time.time()
        cached = _PRICE_CACHE.get(ticker)
        if cached and (now - cached['time']) < _CACHE_TTL_SECONDS:
            return cached['data']

        # Fast Attempt 1: yfinance fast_info (lightweight key-value lookup)
        try:
            t = yf.Ticker(ticker)
            info = t.fast_info
            current = float(info['lastPrice'])
            prev = float(info['previousClose'])
            if not pd.isna(current) and current > 0:
                prev_clean = prev if not pd.isna(prev) and prev > 0 else current
                res = (round(current, 2), round(prev_clean, 2))
                _PRICE_CACHE[ticker] = {'data': res, 'time': now}
                return res
        except Exception:
            pass

        # Fallback Attempt 2: 5-day history DataFrame
        try:
            history = _fetch_history(ticker, period="5d", retries=1, delay=0.2)
            if history is not None and not history.empty and 'Close' in history:
                current = float(history['Close'].iloc[-1])
                prev = float(history['Close'].iloc[-2]) if len(history) >= 2 else current
                current_clean = current if not pd.isna(current) and current > 0 else 0.0
                prev_clean = prev if not pd.isna(prev) and prev > 0 else current_clean
                res = (round(current_clean, 2), round(prev_clean, 2))
                if current_clean > 0:
                    _PRICE_CACHE[ticker] = {'data': res, 'time': now}
                return res
        except Exception:
            pass

        if cached:
            return cached['data']
        return (0.0, 0.0)

    def get_atr14(self, ticker: str) -> float:
        """Fetches the 14-day Average True Range for a ticker. Used for 2×ATR14 trailing stop."""
        try:
            history = _fetch_history(ticker, period="3mo", interval="1d")
            if history is not None and len(history) >= 15:
                atr = calculate_atr(history, period=14)
                val = float(atr.iloc[-1])
                return val if not pd.isna(val) else 0.0
        except Exception:
            pass
        return 0.0

    def check_stop_losses(self):
        """Emergency stop-loss monitor for active positions"""
        to_sell = []
        for ticker, pos in list(self.positions.items()):
            current_price = self.get_stock_price(ticker)
            if current_price <= 0:
                continue
            pos.current_price = current_price
            pnl_pct = (current_price - pos.average_price) / pos.average_price
            
            # Check 3% stop loss or explicit stop loss price
            is_stop_triggered = pnl_pct <= -self.stop_loss_pct
            if pos.stop_loss_price and current_price <= pos.stop_loss_price:
                is_stop_triggered = True
                
            if is_stop_triggered:
                print(f"🚨 STOP LOSS TRIGGERED for {ticker}: Entry={pos.average_price}, Current={current_price}, Loss={pnl_pct*100:.2f}%")
                to_sell.append((ticker, pos.quantity))
                
        for ticker, qty in to_sell:
            stop_reason = generate_trade_summary(ticker=ticker, action="SELL", qty=qty, price=current_price, sma5=current_price*0.96, sma20=current_price, rsi=28.0)
            self.execute_trade(TradeRequest(ticker=ticker, action="SELL", quantity=qty), strategy="STOP_LOSS", reason=stop_reason)

    def get_portfolio_summary(self) -> PortfolioSummary:
        self.check_stop_losses()
        total_value = self.cash
        position_list = []
        today_unrealized_pnl = 0.0
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        for ticker, pos in self.positions.items():
            fetched_price, prev_close = self.get_stock_price_and_prev_close(ticker)
            if fetched_price > 0:
                pos.current_price = fetched_price
            elif not pos.current_price or pos.current_price <= 0:
                pos.current_price = pos.average_price
                prev_close = pos.average_price

            current_price = pos.current_price
            pos.pnl = (current_price - pos.average_price) * pos.quantity
            pos.pnl_pct = ((current_price - pos.average_price) / pos.average_price * 100) if pos.average_price > 0 else 0.0
            
            base_price = prev_close if prev_close > 0 else pos.average_price
            pos.prev_close = base_price
            pos.todays_pnl = (current_price - base_price) * pos.quantity
            pos.todays_pnl_pct = ((current_price - base_price) / base_price * 100) if base_price > 0 else 0.0
            
            total_value += current_price * pos.quantity
            position_list.append(pos)

            today_unrealized_pnl += pos.todays_pnl

        today_realized_pnl = sum(
            item.pnl for item in self.history 
            if item.pnl is not None and item.timestamp >= today_start
        )
        todays_pnl = round(today_realized_pnl + today_unrealized_pnl, 2)

        invested_cost = sum(p.quantity * p.average_price for p in self.positions.values())

        return PortfolioSummary(
            cash=self.cash,
            equity=total_value - self.cash,
            total_value=total_value,
            invested_cost=round(invested_cost, 2),
            todays_pnl=todays_pnl,
            positions=position_list
        )

    def execute_trade(self, trade_request: TradeRequest, strategy: str = "MANUAL", reason: Optional[str] = None):
        print(f"Executing trade: {trade_request} ({strategy})")
        ticker = trade_request.ticker
        action = trade_request.action.upper()
        quantity = trade_request.quantity
        
        current_price = self.get_stock_price(ticker)
        if current_price <= 0:
             print(f"Error: Could not fetch price for {ticker}")
             return {"status": "error", "message": "Invalid price"}

        cost = current_price * quantity
        
        if action == "BUY":
            if self.cash >= cost:
                self.cash -= cost
                if ticker in self.positions:
                   pos = self.positions[ticker]
                   total_cost_existing = pos.quantity * pos.average_price
                   total_cost_new = total_cost_existing + cost
                   pos.quantity += quantity
                   pos.average_price = total_cost_new / pos.quantity
                else:
                    stop_price = current_price * (1 - self.stop_loss_pct)
                    self.positions[ticker] = PortfolioPosition(
                        ticker=ticker,
                        quantity=quantity,
                        average_price=current_price,
                        current_price=current_price,
                        pnl=0.0,
                        stop_loss_price=stop_price
                    )
                print(f"Bought {quantity} {ticker} at {current_price}")
                
                history_item = TradeHistoryItem(
                    id=str(uuid.uuid4()),
                    ticker=ticker,
                    action="BUY",
                    quantity=quantity,
                    price=current_price,
                    timestamp=datetime.now(),
                    strategy=strategy,
                    reason=reason or f"Bullish entry for {ticker}"
                )
                self.history.append(history_item)
                self.save_history()

                return {"status": "success", "message": f"Bought {quantity} {ticker}"}
            else:
                 return {"status": "error", "message": "Insufficient funds"}

        elif action == "SELL":
            if ticker in self.positions and self.positions[ticker].quantity >= quantity:
                self.cash += cost
                pos = self.positions[ticker]
                pos.quantity -= quantity
                
                avg_price = pos.average_price 
                pnl = (current_price - avg_price) * quantity
                
                if pos.quantity == 0:
                    del self.positions[ticker]
                print(f"Sold {quantity} {ticker} at {current_price}")
                
                history_item = TradeHistoryItem(
                    id=str(uuid.uuid4()),
                    ticker=ticker,
                    action="SELL",
                    quantity=quantity,
                    price=current_price,
                    timestamp=datetime.now(),
                    pnl=pnl,
                    strategy=strategy,
                    reason=reason or f"Exit position for {ticker}"
                )
                self.history.append(history_item)
                self.save_history()

                return {"status": "success", "message": f"Sold {quantity} {ticker}"}
            else:
                 return {"status": "error", "message": "Insufficient quantity"}
        
        return {"status": "error", "message": "Invalid action"}

    def run_strategy(self, ticker: str, quantity: int = 5, use_all_cash: bool = False, execute: bool = True):
        """Runs SMA5 / SMA20 + RSI(14) Confirmation Filter + ATR Volatility Sizing"""
        try:
            history = _fetch_history(ticker, period="3mo", interval="1d")

            if history is None or len(history) < 25:
                return {"status": "error", "message": f"Not enough historical price data for {ticker}"}
            
            # Compute technical indicators
            history['SMA5'] = history['Close'].rolling(window=5).mean()
            history['SMA20'] = history['Close'].rolling(window=20).mean()
            history['ATR14'] = calculate_atr(history, period=14)
            history['RSI14'] = calculate_rsi(history, period=14)
            
            last_close = float(history['Close'].iloc[-1])
            last_sma5 = float(history['SMA5'].iloc[-1])
            last_sma20 = float(history['SMA20'].iloc[-1])
            last_atr = float(history['ATR14'].iloc[-1]) if not pd.isna(history['ATR14'].iloc[-1]) else last_close * 0.02
            last_rsi = float(history['RSI14'].iloc[-1]) if not pd.isna(history['RSI14'].iloc[-1]) else 50.0
            
            close_5d_ago = float(history['Close'].iloc[-6]) if len(history) >= 6 else last_close
            price_change_5d = ((last_close - close_5d_ago) / close_5d_ago * 100) if close_5d_ago > 0 else 0.0
            
            signal = "HOLD"
            
            # Signal Logic with RSI Confirmation Filter (> 50 for bullish momentum)
            if last_sma5 > last_sma20:
                if last_rsi > 50:
                    signal = "BUY"
                else:
                    signal = "HOLD"
            elif last_sma5 < last_sma20:
                signal = "SELL"

            atr_pct = (last_atr / last_close * 100) if last_close > 0 else 0.0
            reason = generate_trade_summary(
                ticker=ticker,
                action=signal,
                qty=quantity,
                price=last_close,
                sma5=last_sma5,
                sma20=last_sma20,
                rsi=last_rsi,
                atr_pct=atr_pct
            )
                
            # ATR-based volatility position sizing
            # Risk 2% of capital divided by 1.5 * ATR volatility
            total_equity = self.cash + sum(p.current_price * p.quantity for p in self.positions.values())
            risk_amount = total_equity * self.risk_per_trade_pct
            risk_per_share = max(1.5 * last_atr, last_close * self.stop_loss_pct)
            atr_qty = int(risk_amount // risk_per_share) if risk_per_share > 0 else quantity
            atr_qty = max(1, atr_qty)
            
            trade_result = None
            if execute:
                if signal == "BUY":
                    qty_to_buy = atr_qty if not use_all_cash else int(self.cash // last_close)
                    if self.cash >= (last_close * qty_to_buy) and qty_to_buy > 0:
                        trade_result = self.execute_trade(TradeRequest(ticker=ticker, action="BUY", quantity=qty_to_buy), strategy="SMA+RSI+ATR", reason=reason)
                    else:
                        reason += " (Insufficient cash for full order)"
                elif signal == "SELL":
                    if ticker in self.positions:
                        qty_to_sell = self.positions[ticker].quantity
                        trade_result = self.execute_trade(TradeRequest(ticker=ticker, action="SELL", quantity=qty_to_sell), strategy="SMA+RSI+ATR", reason=reason)

            stop_price = last_close * (1 - self.stop_loss_pct)
            return {
                "ticker": ticker,
                "price": last_close,
                "sma5": last_sma5,
                "sma20": last_sma20,
                "atr14": last_atr,
                "rsi14": last_rsi,
                "stop_loss_price": stop_price,
                "recommended_atr_qty": atr_qty,
                "signal": signal,
                "reason": reason,
                "trade_executed": trade_result
            }

        except Exception as e:
            print(f"Strategy error: {e}")
            return {"status": "error", "message": str(e)}

    def run_backtest(self, ticker: str = "RELIANCE.NS", months: int = 12, initial_capital: float = 100000.0) -> BacktestResult:
        """Runs a 6-12 month historical simulation with ATR sizing, RSI filter, and Stop Loss"""
        period_str = "6mo" if months <= 6 else "1y"
        df = _fetch_history(ticker, period=period_str, interval="1d")

        if df is None or len(df) < 30:
            raise ValueError(f"Insufficient historical data for {ticker} over {months} months")
            
        df['SMA5'] = df['Close'].rolling(window=5).mean()
        df['SMA20'] = df['Close'].rolling(window=20).mean()
        df['ATR14'] = calculate_atr(df, period=14)
        df['RSI14'] = calculate_rsi(df, period=14)
        
        cash = initial_capital
        position_qty = 0
        entry_price = 0.0
        entry_date = ""
        stop_price = 0.0
        
        trades: List[BacktestTrade] = []
        equity_curve: List[Dict[str, float]] = []
        
        for i in range(20, len(df)):
            date_str = df.index[i].strftime("%Y-%m-%d")
            close = float(df['Close'].iloc[i])
            low = float(df['Low'].iloc[i])
            sma5 = float(df['SMA5'].iloc[i])
            sma20 = float(df['SMA20'].iloc[i])
            atr = float(df['ATR14'].iloc[i]) if not pd.isna(df['ATR14'].iloc[i]) else close * 0.02
            rsi = float(df['RSI14'].iloc[i]) if not pd.isna(df['RSI14'].iloc[i]) else 50.0
            
            # Check stop loss if holding
            if position_qty > 0:
                if low <= stop_price or close <= stop_price:
                    exit_price = min(close, stop_price)
                    pnl = (exit_price - entry_price) * position_qty
                    pnl_pct = (exit_price - entry_price) / entry_price * 100
                    cash += position_qty * exit_price
                    
                    trades.append(BacktestTrade(
                        entry_date=entry_date,
                        exit_date=date_str,
                        action="SELL",
                        entry_price=entry_price,
                        exit_price=exit_price,
                        quantity=position_qty,
                        pnl=pnl,
                        pnl_pct=pnl_pct,
                        exit_reason="STOP_LOSS (-3.0%)"
                    ))
                    position_qty = 0
                    
            # Check Signals
            if position_qty == 0:
                # BUY check: SMA5 > SMA20 AND RSI > 50
                if sma5 > sma20 and rsi > 50:
                    risk_amt = cash * self.risk_per_trade_pct
                    risk_per_share = max(1.5 * atr, close * self.stop_loss_pct)
                    qty = int(risk_amt // risk_per_share) if risk_per_share > 0 else int((cash * 0.25) // close)
                    qty = min(qty, int(cash // close))
                    
                    if qty > 0:
                        position_qty = qty
                        entry_price = close
                        entry_date = date_str
                        stop_price = close * (1 - self.stop_loss_pct)
                        cash -= qty * close
            else:
                # SELL check: SMA5 < SMA20
                if sma5 < sma20:
                    exit_price = close
                    pnl = (exit_price - entry_price) * position_qty
                    pnl_pct = (exit_price - entry_price) / entry_price * 100
                    cash += position_qty * exit_price
                    
                    trades.append(BacktestTrade(
                        entry_date=entry_date,
                        exit_date=date_str,
                        action="SELL",
                        entry_price=entry_price,
                        exit_price=exit_price,
                        quantity=position_qty,
                        pnl=pnl,
                        pnl_pct=pnl_pct,
                        exit_reason="SMA Crossover Exit"
                    ))
                    position_qty = 0

            current_equity = cash + (position_qty * close)
            equity_curve.append({
                "date": date_str,
                "equity": round(current_equity, 2),
                "close": round(close, 2)
            })

        final_equity = cash + (position_qty * float(df['Close'].iloc[-1]))
        total_return_pct = ((final_equity - initial_capital) / initial_capital) * 100
        
        total_trades = len(trades)
        winning_trades = len([t for t in trades if t.pnl > 0])
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0
        
        # Calculate Max Drawdown %
        equities = [e["equity"] for e in equity_curve]
        peak = equities[0] if equities else initial_capital
        max_dd = 0.0
        for eq in equities:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100
            if dd > max_dd:
                max_dd = dd
                
        # Sharpe Ratio (annualized)
        returns = pd.Series(equities).pct_change().dropna()
        if len(returns) > 1 and returns.std() > 0:
            sharpe = (returns.mean() / returns.std()) * np.sqrt(252)
        else:
            sharpe = 0.0
            
        return BacktestResult(
            ticker=ticker,
            months=months,
            initial_capital=initial_capital,
            final_equity=round(final_equity, 2),
            total_return_pct=round(total_return_pct, 2),
            win_rate=round(win_rate, 2),
            total_trades=total_trades,
            max_drawdown_pct=round(max_dd, 2),
            sharpe_ratio=round(float(sharpe), 2),
            trades=trades,
            equity_curve=equity_curve
        )

    def _get_or_create_portfolio(self, db: Session, user_id: Optional[str] = None) -> Optional[PortfolioDB]:
        if not user_id:
            return None

        portfolio = db.query(PortfolioDB).filter(PortfolioDB.user_id == user_id).first()
        if not portfolio:
            user = db.query(UserDB).filter(UserDB.id == user_id).first()
            if user:
                portfolio = PortfolioDB(id=str(uuid.uuid4()), user_id=user.id, cash=100000.0)
                db.add(portfolio)
                db.commit()
                db.refresh(portfolio)
        return portfolio

    def _get_consolidated_position(self, db: Session, user_id: str, ticker: str) -> Optional[PositionDB]:
        positions = db.query(PositionDB).filter(
            PositionDB.user_id == user_id,
            PositionDB.ticker == ticker
        ).all()
        if not positions:
            return None
        if len(positions) == 1:
            return positions[0]

        main_pos = positions[0]
        total_qty = sum(p.quantity for p in positions)
        if total_qty > 0:
            total_cost = sum(p.quantity * p.average_price for p in positions)
            main_pos.average_price = total_cost / total_qty
        main_pos.quantity = total_qty

        for dup in positions[1:]:
            db.delete(dup)
        db.commit()
        return main_pos

    def execute_trade_db(self, trade_request: TradeRequest, db: Session, user_id: Optional[str] = None, strategy: str = "MANUAL", reason: Optional[str] = None):
        ticker = trade_request.ticker.upper()
        action = trade_request.action.upper()
        quantity = trade_request.quantity

        current_price = self.get_stock_price(ticker)
        if current_price <= 0:
            return {"status": "error", "message": f"Could not fetch price for {ticker}"}

        portfolio = self._get_or_create_portfolio(db, user_id=user_id)
        if not portfolio:
            return {"status": "error", "message": "Please sign in or create an account first to execute trades"}

        cost = current_price * quantity

        if action == "BUY":
            if portfolio.cash >= cost:
                portfolio.cash -= cost
                existing_pos = self._get_consolidated_position(db, portfolio.user_id, ticker)
                if existing_pos:
                    total_cost = (existing_pos.quantity * existing_pos.average_price) + cost
                    existing_pos.quantity += quantity
                    existing_pos.average_price = total_cost / existing_pos.quantity
                    existing_pos.current_price = current_price
                else:
                    new_pos = PositionDB(
                        id=str(uuid.uuid4()),
                        user_id=portfolio.user_id,
                        ticker=ticker,
                        quantity=quantity,
                        average_price=current_price,
                        current_price=current_price,
                        peak_price=current_price  # Trailing stop starts tracking from entry price
                    )
                    db.add(new_pos)

                trade = TradeDB(
                    id=str(uuid.uuid4()),
                    user_id=portfolio.user_id,
                    ticker=ticker,
                    action="BUY",
                    quantity=quantity,
                    price=current_price,
                    strategy=strategy,
                    reason=reason or f"Manual BUY order for {ticker}"
                )
                db.add(trade)
                db.commit()
                return {"status": "success", "message": f"Bought {quantity} shares of {ticker}"}
            else:
                return {"status": "error", "message": "Insufficient cash balance"}

        elif action == "SELL":
            existing_pos = self._get_consolidated_position(db, portfolio.user_id, ticker)
            if existing_pos and existing_pos.quantity >= quantity:
                portfolio.cash += cost
                existing_pos.quantity -= quantity
                pnl = (current_price - existing_pos.average_price) * quantity
                if existing_pos.quantity == 0:
                    db.delete(existing_pos)

                trade = TradeDB(
                    id=str(uuid.uuid4()),
                    user_id=portfolio.user_id,
                    ticker=ticker,
                    action="SELL",
                    quantity=quantity,
                    price=current_price,
                    pnl=pnl,
                    strategy=strategy,
                    reason=reason or f"Manual SELL order for {ticker}"
                )
                db.add(trade)
                db.commit()
                return {"status": "success", "message": f"Sold {quantity} shares of {ticker}"}
            else:
                return {"status": "error", "message": "Insufficient position quantity to sell"}

        return {"status": "error", "message": "Invalid trade action"}

    def book_profit_db(self, db: Session, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Evaluates Total Portfolio Value against baseline capital (100,000 INR).
        Sells 100% of all stock positions currently in profit (current_price > average_price or pnl > 0),
        credits cash balance, and logs profit booking rationale.
        """
        profit_positions_sold = []
        total_profit_booked = 0.0

        try:
            # 1. Fetch live portfolio summary
            if user_id:
                summary = self.get_portfolio_summary_db(db, user_id=user_id)
            else:
                summary = self.get_portfolio_summary()

            portfolio_total_val = summary.total_value
            initial_capital = 100000.0
            overall_pnl = portfolio_total_val - initial_capital

            # 2. Identify all positions currently in profit
            to_sell = []
            for pos in summary.positions:
                curr_p = pos.current_price if (pos.current_price and pos.current_price > 0) else pos.average_price
                pnl = pos.pnl if pos.pnl != 0 else (curr_p - pos.average_price) * pos.quantity
                if pnl > 0 or curr_p > pos.average_price:
                    to_sell.append((pos.ticker, pos.quantity, pos.average_price, curr_p, pnl))

            # 3. Execute SELL order for each profitable stock
            for ticker, qty, avg_p, curr_p, pnl in to_sell:
                try:
                    trade_req = TradeRequest(ticker=ticker, action="SELL", quantity=qty)
                    sell_reason = f"Profit Target Booked (+₹{pnl:.2f}). Total Portfolio Value: ₹{portfolio_total_val:,.2f}."
                    
                    if user_id:
                        self.execute_trade_db(trade_req, db, user_id=user_id, strategy="PROFIT_BOOKING", reason=sell_reason)
                    else:
                        self.execute_trade(trade_req, strategy="PROFIT_BOOKING", reason=sell_reason)

                    profit_positions_sold.append({
                        "ticker": ticker,
                        "quantity": qty,
                        "buy_price": avg_p,
                        "sell_price": curr_p,
                        "profit": round(pnl, 2)
                    })
                    total_profit_booked += pnl
                except Exception as err_sell:
                    print(f"Error selling position {ticker}: {err_sell}")

            db.commit()

            count = len(profit_positions_sold)
            if count == 0:
                return {
                    "status": "info",
                    "message": f"Portfolio Total Value is ₹{portfolio_total_val:,.2f}. No individual positions are currently in profit to cash out.",
                    "sold_positions": [],
                    "total_profit_booked": 0.0,
                    "bot_scan_triggered": False
                }

            return {
                "status": "success",
                "message": f"Successfully cashed out {count} profitable stock{'s' if count > 1 else ''} locking in +₹{total_profit_booked:.2f} profit! Total Portfolio Value: ₹{portfolio_total_val:,.2f}.",
                "sold_positions": profit_positions_sold,
                "total_profit_booked": round(total_profit_booked, 2),
                "bot_scan_triggered": True
            }

        except Exception as e:
            print(f"Error in book_profit_db: {e}")
            return {
                "status": "error",
                "message": f"Profit booking failed: {str(e)}",
                "sold_positions": [],
                "total_profit_booked": 0.0,
                "bot_scan_triggered": False
            }

    def get_portfolio_summary_db(self, db: Session, user_id: Optional[str] = None) -> PortfolioSummary:
        portfolio = self._get_or_create_portfolio(db, user_id=user_id)
        if not portfolio:
            return PortfolioSummary(cash=100000.0, equity=0.0, total_value=100000.0, positions=[])

        cash = portfolio.cash
        raw_positions = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id).all()
        by_ticker = {}
        for p in raw_positions:
            if p.ticker not in by_ticker:
                by_ticker[p.ticker] = p
            else:
                main_p = by_ticker[p.ticker]
                tot_q = main_p.quantity + p.quantity
                if tot_q > 0:
                    main_p.average_price = ((main_p.quantity * main_p.average_price) + (p.quantity * p.average_price)) / tot_q
                main_p.quantity = tot_q
                db.delete(p)
        if len(raw_positions) != len(by_ticker):
            db.commit()
        db_positions = list(by_ticker.values())
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        position_list = []
        equity = 0.0
        today_unrealized_pnl = 0.0

        # Pre-fetch all today's BUY trades in 1 single Supabase query to avoid N+1 database network roundtrips
        all_today_buys = db.query(TradeDB).filter(
            TradeDB.user_id == portfolio.user_id,
            TradeDB.action == "BUY",
            TradeDB.timestamp >= today_start
        ).all()
        today_buys_by_ticker = {}
        for t in all_today_buys:
            today_buys_by_ticker.setdefault(t.ticker, []).append(t)

        # Parallel fetch live stock prices and prev_close for all positions
        price_map = {}
        if db_positions:
            with ThreadPoolExecutor(max_workers=min(len(db_positions), 16)) as executor:
                future_to_ticker = {executor.submit(self.get_stock_price_and_prev_close, pos.ticker): pos.ticker for pos in db_positions}
                for future in as_completed(future_to_ticker):
                    ticker = future_to_ticker[future]
                    try:
                        price_map[ticker] = future.result()
                    except Exception:
                        price_map[ticker] = (0.0, 0.0)

        for pos in db_positions:
            price, prev_close = price_map.get(pos.ticker, (0.0, 0.0))
            if price <= 0:
                price = pos.current_price or pos.average_price
                prev_close = price

            pnl = (price - pos.average_price) * pos.quantity
            pos_val = price * pos.quantity
            equity += pos_val

            # Determine Today's Unrealized PnL using split lot calculation for old vs new shares:
            today_buys = today_buys_by_ticker.get(pos.ticker, [])

            total_qty_bought_today = sum(t.quantity for t in today_buys)
            total_cost_bought_today = sum(t.quantity * t.price for t in today_buys)
            avg_price_today = (total_cost_bought_today / total_qty_bought_today) if total_qty_bought_today > 0 else 0.0

            qty_bought_today = min(total_qty_bought_today, pos.quantity)
            cost_bought_today = avg_price_today * qty_bought_today
            qty_held_before = max(0, pos.quantity - qty_bought_today)

            base_old = prev_close if prev_close > 0 else pos.average_price
            pnl_old = (price - base_old) * qty_held_before
            pnl_new = (price * qty_bought_today) - cost_bought_today
            pos_today_pnl = pnl_old + pnl_new

            effective_base_cost = (base_old * qty_held_before) + cost_bought_today
            pos_today_pnl_pct = ((pos_today_pnl / effective_base_cost) * 100) if effective_base_cost > 0 else 0.0
            pnl_pct = ((price - pos.average_price) / pos.average_price * 100) if pos.average_price > 0 else 0.0
            today_unrealized_pnl += pos_today_pnl

            # Use stored trailing stop price; fall back to 7% below peak if not yet computed
            peak = pos.peak_price if pos.peak_price else pos.average_price
            trailing_stop = pos.trailing_stop_price if pos.trailing_stop_price else (peak * 0.93)

            position_list.append(PortfolioPosition(
                ticker=pos.ticker,
                quantity=pos.quantity,
                average_price=pos.average_price,
                current_price=price,
                pnl=round(pnl, 2),
                pnl_pct=round(pnl_pct, 2),
                todays_pnl=round(pos_today_pnl, 2),
                todays_pnl_pct=round(pos_today_pnl_pct, 2),
                prev_close=prev_close,
                stop_loss_price=trailing_stop,
                peak_price=peak,
                trailing_stop_price=trailing_stop
            ))

        position_list.sort(key=lambda x: x.ticker)

        invested_cost = sum(pos.average_price * pos.quantity for pos in db_positions)
        total_val = cash + equity
        db_trades_today = db.query(TradeDB).filter(
            TradeDB.user_id == portfolio.user_id,
            TradeDB.timestamp >= today_start,
            TradeDB.pnl.isnot(None)
        ).all()
        today_realized_pnl = sum(t.pnl for t in db_trades_today if t.pnl)
        todays_pnl = round(today_realized_pnl + today_unrealized_pnl, 2)

        return PortfolioSummary(
            cash=cash,
            equity=equity,
            total_value=total_val,
            invested_cost=round(invested_cost, 2),
            todays_pnl=todays_pnl,
            positions=position_list
        )

    def run_auto_cycle_db(self, db: Session, user_id: Optional[str] = None):
        """Executes a 60-second quantitative auto-trading cycle scanning ALL 117 companies in parallel."""
        # Lock ensures only one cycle runs at a time — prevents double-spending
        # when multiple processes or threads hit the same DB simultaneously
        if not self._trade_lock.acquire(blocking=False):
            return {"status": "skipped", "message": "Cycle already in progress", "executed_trades": []}
        try:
            return self._run_auto_cycle_locked(db, user_id=user_id)
        finally:
            self._trade_lock.release()

    def _run_auto_cycle_locked(self, db: Session, user_id: Optional[str] = None):
        from concurrent.futures import ThreadPoolExecutor
        executed_trades = []

        portfolio = self._get_or_create_portfolio(db, user_id=user_id)
        if not portfolio:
            return {"status": "error", "message": "Please sign in or create an account first to run auto-trading"}

        # 2. Check 3.0% stop losses on active positions
        db_positions = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id).all()
        for pos in db_positions:
            price = self.get_stock_price(pos.ticker)
            if price <= 0: continue

            # --- Trailing Stop Logic (2 × ATR14) ---
            # 1. Update peak price: only moves up, never down
            current_peak = pos.peak_price if pos.peak_price else pos.average_price
            if price > current_peak:
                current_peak = price
                pos.peak_price = price

            # 2. Compute ATR14-based trailing stop distance
            atr14 = self.get_atr14(pos.ticker)
            if atr14 <= 0:
                atr14 = current_peak * 0.035  # fallback: 3.5% of peak price
            trailing_stop = current_peak - (self.trailing_multiplier * atr14)
            pos.trailing_stop_price = trailing_stop
            db.commit()  # persist updated peak and stop before checking trigger

            # 3. Trigger sell if current price falls below trailing stop
            if price < trailing_stop:
                cost = price * pos.quantity
                portfolio.cash += cost
                pnl = (price - pos.average_price) * pos.quantity
                peak_gain_pct = ((current_peak - pos.average_price) / pos.average_price * 100)

                trade = TradeDB(
                    id=str(uuid.uuid4()),
                    user_id=portfolio.user_id,
                    ticker=pos.ticker,
                    action="SELL",
                    quantity=pos.quantity,
                    price=price,
                    pnl=pnl,
                    strategy="TRAILING_STOP",
                    reason=f"🎯 2×ATR14 Trailing Stop for {pos.ticker} | Entry: ₹{pos.average_price:.2f} | Peak: ₹{current_peak:.2f} (+{peak_gain_pct:.1f}%) | Stop: ₹{trailing_stop:.2f} | Exit: ₹{price:.2f}"
                )
                db.add(trade)
                db.delete(pos)
                db.commit()
                executed_trades.append({"ticker": pos.ticker, "action": "SELL", "quantity": pos.quantity, "reason": "TRAILING_STOP", "pnl": pnl})

        # 3. Parallel Scan ALL 117 Companies in INDIAN_STOCKS
        def scan_stock(stock_item):
            ticker = stock_item["symbol"]
            try:
                res = self.run_strategy(ticker, execute=False)
                if res.get("status") == "error": return None
                return res
            except Exception as e:
                print(f"Parallel scan error for {ticker}: {e}")
                return None

        with ThreadPoolExecutor(max_workers=10) as executor:
            all_results = list(executor.map(scan_stock, INDIAN_STOCKS))

        all_results = [r for r in all_results if r]

        # 4. Handle SELL signals for existing holdings
        for res in all_results:
            if res.get("signal") == "SELL":
                ticker = res.get("ticker")
                price = res.get("price")
                existing_pos = self._get_consolidated_position(db, portfolio.user_id, ticker)
                if existing_pos and price and price > 0:
                    cost = price * existing_pos.quantity
                    portfolio.cash += cost
                    pnl = (price - existing_pos.average_price) * existing_pos.quantity

                    trade = TradeDB(
                        id=str(uuid.uuid4()),
                        user_id=portfolio.user_id,
                        ticker=ticker,
                        action="SELL",
                        quantity=existing_pos.quantity,
                        price=price,
                        pnl=pnl,
                        strategy="SMA+RSI+ATR",
                        reason=res.get("reason")
                    )
                    db.add(trade)
                    db.delete(existing_pos)
                    db.commit()
                    executed_trades.append({"ticker": ticker, "action": "SELL", "quantity": existing_pos.quantity, "reason": res.get("reason")})

        # 5. Filter & Rank ALL BUY candidates across all 117 companies
        buy_candidates = []
        for res in all_results:
            if res.get("signal") == "BUY":
                price = res.get("price")
                ticker = res.get("ticker")
                if not price or price <= 0: continue

                sma5 = res.get("sma5", 0)
                sma20 = res.get("sma20", 1)
        # Compute current total portfolio value for adaptive risk & concentration rules
        all_held = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id).all()
        total_portfolio_value = portfolio.cash + sum(
            (p.current_price or p.average_price) * p.quantity for p in all_held
        )

        # Adaptive position sizing parameters:
        # - Small portfolios (< ₹20,000): allow 50% max concentration per stock and lower min trade threshold (₹300) so small capital (5k, 10k) can trade seamlessly.
        # - Standard portfolios (>= ₹20,000): enforce 25% max concentration and ₹2,000 min trade threshold.
        if total_portfolio_value < 20000:
            MAX_CONCENTRATION = 0.50
            MIN_POSITION_CASH = min(300.0, max(total_portfolio_value * 0.05, 100.0))
        else:
            MAX_CONCENTRATION = 0.25
            MIN_POSITION_CASH = 2000.0

        # 5. Filter & Rank ALL BUY candidates across all 40 companies
        buy_candidates = []
        for res in all_results:
            if res.get("signal") == "BUY":
                price = res.get("price")
                ticker = res.get("ticker")
                if not price or price <= 0: continue

                sma5 = res.get("sma5", 0)
                sma20 = res.get("sma20", 1)
                rsi = res.get("rsi14", 50)

                # Skip if already at max concentration limit for this account size
                existing_holding = self._get_consolidated_position(db, portfolio.user_id, ticker)
                existing_val = (existing_holding.quantity * price) if existing_holding else 0
                if existing_val >= total_portfolio_value * MAX_CONCENTRATION:
                    continue  # Already at max concentration limit for this stock

                # Calculate quantitative momentum score across all 40 stocks
                sma20_safe = sma20 if sma20 > 0 else 1.0
                score = ((sma5 - sma20_safe) / sma20_safe * 100) + (rsi - 50)
                buy_candidates.append({
                    "ticker": ticker,
                    "price": price,
                    "atr_qty": res.get("recommended_atr_qty", 5),
                    "reason": res.get("reason"),
                    "score": score
                })

        # Sort ALL BUY candidates by quantitative score (best first)
        buy_candidates.sort(key=lambda x: x["score"], reverse=True)

        # Re-fetch cash from DB to get the most current value after sells
        db.refresh(portfolio)

        # 6. Deploy ALL available cash into BUY candidates (no hard stock cap)
        # Buys in score order until cash runs out or no more BUY signals remain
        for cand in buy_candidates:
            if portfolio.cash < MIN_POSITION_CASH:
                break  # Not enough cash for a meaningful position

            ticker = cand["ticker"]
            price = cand.get("price")
            if not price or price <= 0:
                continue
            atr_qty = cand.get("atr_qty", 5)
            reason = cand.get("reason", "")

            # Enforce adaptive max concentration per stock
            existing_pos = self._get_consolidated_position(db, portfolio.user_id, ticker)
            existing_value = (existing_pos.quantity * price) if existing_pos else 0
            max_invest = (total_portfolio_value * MAX_CONCENTRATION) - existing_value
            if max_invest < price:
                continue  # Cannot afford even 1 share under concentration limit

            qty_by_cash = int(portfolio.cash // price)
            if qty_by_cash <= 0:
                continue

            max_qty_allowed = int(max_invest // price)
            if max_qty_allowed <= 0:
                continue

            final_qty = min(qty_by_cash, max_qty_allowed, max(atr_qty, 1))
            if final_qty <= 0:
                continue

            cost = price * final_qty
            if portfolio.cash < cost:
                continue

            if final_qty > 0 and portfolio.cash >= cost:
                # --- DB-level atomic cash guard (prevents multi-process overdraft) ---
                # Lock the portfolio row and re-check cash inside the same transaction.
                # If another process already spent this cash, we'll see the reduced balance
                # and skip this buy instead of double-spending.
                db.refresh(portfolio)  # re-read cash from DB before committing
                if portfolio.cash < cost:
                    continue  # Another process already spent this cash — skip
                # -----------------------------------------------------------------------
                portfolio.cash -= cost
                if existing_pos:
                    tot_cost = (existing_pos.quantity * existing_pos.average_price) + cost
                    existing_pos.quantity += final_qty
                    existing_pos.average_price = tot_cost / existing_pos.quantity
                    existing_pos.current_price = price
                else:
                    new_pos = PositionDB(
                        id=str(uuid.uuid4()),
                        user_id=portfolio.user_id,
                        ticker=ticker,
                        quantity=final_qty,
                        average_price=price,
                        current_price=price,
                        peak_price=price
                    )
                    db.add(new_pos)

                trade = TradeDB(
                    id=str(uuid.uuid4()),
                    user_id=portfolio.user_id,
                    ticker=ticker,
                    action="BUY",
                    quantity=final_qty,
                    price=price,
                    strategy="SMA+RSI+ATR",
                    reason=reason
                )
                db.add(trade)
                db.commit()
                executed_trades.append({"ticker": ticker, "action": "BUY", "quantity": final_qty, "reason": reason, "score": round(cand["score"], 2)})


        # 7. Portfolio Rotation: Swap weak HOLD positions for higher-scoring BUY opportunities
        # If a stock we hold now shows "HOLD" (weakening trend) and a much better BUY candidate
        # exists that we don't own, rotate capital into the better opportunity.
        ROTATION_THRESHOLD = 15  # New candidate must score 15+ points higher to trigger rotation

        owned_tickers = {p.ticker for p in db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id).all()}
        unowned_buys = [c for c in buy_candidates if c["ticker"] not in owned_tickers]

        if unowned_buys:
            holdings_snapshot = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id).all()
            for holding in holdings_snapshot:
                # Don't rotate a position we just bought this cycle
                if any(t["ticker"] == holding.ticker and t["action"] == "BUY" for t in executed_trades):
                    continue

                # Re-check signal for existing holding
                res = self.run_strategy(holding.ticker, execute=False)
                if res.get("signal") != "HOLD":
                    continue  # Only rotate genuine HOLD positions (SELL is already handled above)

                # Score of the weakening HOLD position
                sma5_h = res.get("sma5", 0)
                sma20_h = res.get("sma20", 1)
                hold_score = ((sma5_h - max(sma20_h, 1.0)) / max(sma20_h, 1.0) * 100) + (res.get("rsi14", 50) - 50)

                # Best unowned BUY candidate
                best = unowned_buys[0]
                if best["score"] <= hold_score + ROTATION_THRESHOLD:
                    continue  # Not a meaningful enough improvement to justify rotation

                # --- SELL the HOLD position ---
                exit_price = res.get("price") or self.get_stock_price(holding.ticker)
                if not exit_price or exit_price <= 0:
                    continue

                proceeds = exit_price * holding.quantity
                pnl = (exit_price - holding.average_price) * holding.quantity
                portfolio.cash += proceeds

                db.add(TradeDB(
                    id=str(uuid.uuid4()),
                    user_id=portfolio.user_id,
                    ticker=holding.ticker,
                    action="SELL",
                    quantity=holding.quantity,
                    price=exit_price,
                    pnl=pnl,
                    strategy="ROTATION",
                    reason=f"[ROTATION] Rotating out of {holding.ticker} (momentum score: {hold_score:.1f}) -> {best['ticker']} (score: {best['score']:.1f})"
                ))
                db.delete(holding)
                db.commit()
                executed_trades.append({"ticker": holding.ticker, "action": "SELL", "reason": "ROTATION", "pnl": round(pnl, 2)})

                # --- BUY the better candidate ---
                buy_ticker = best["ticker"]
                buy_price = best.get("price")
                if buy_price and buy_price > 0 and portfolio.cash >= buy_price:
                    ex_new = self._get_consolidated_position(db, portfolio.user_id, buy_ticker)
                    ex_val = (ex_new.quantity * buy_price) if ex_new else 0
                    
                    qty_rot_by_cash = int(portfolio.cash // buy_price)
                    max_rot_allowed = int(((total_portfolio_value * MAX_CONCENTRATION) - ex_val) // buy_price)
                    final_rot_qty = min(qty_rot_by_cash, max_rot_allowed, max(best.get("atr_qty", 5), 1))
                    
                    if final_rot_qty > 0:
                        rot_cost = buy_price * final_rot_qty
                        if portfolio.cash >= rot_cost:
                            portfolio.cash -= rot_cost
                            if ex_new:
                                tot_rot = (ex_new.quantity * ex_new.average_price) + rot_cost
                                ex_new.quantity += final_rot_qty
                                ex_new.average_price = tot_rot / ex_new.quantity
                                ex_new.current_price = buy_price
                            else:
                                db.add(PositionDB(
                                    id=str(uuid.uuid4()),
                                    user_id=portfolio.user_id,
                                    ticker=buy_ticker,
                                    quantity=final_rot_qty,
                                    average_price=buy_price,
                                    current_price=buy_price,
                                    peak_price=buy_price
                                ))
                            db.add(TradeDB(
                                id=str(uuid.uuid4()),
                                user_id=portfolio.user_id,
                                ticker=buy_ticker,
                                action="BUY",
                                quantity=final_rot_qty,
                                price=buy_price,
                                strategy="ROTATION",
                                reason=f"[ROTATION] Rotation into {buy_ticker}: {best.get('reason', '')}"
                            ))
                            db.commit()
                            executed_trades.append({"ticker": buy_ticker, "action": "BUY", "reason": "ROTATION", "score": round(best["score"], 2)})
                            # Remove from unowned list now that we hold it
                            unowned_buys = [c for c in unowned_buys if c["ticker"] != buy_ticker]

        return {"status": "success", "executed_trades": executed_trades, "count": len(executed_trades)}


    async def start_auto_trading(self, user_id: Optional[str] = None):
        if self.is_running:
            return
        self.is_running = True
        self.auto_user_id = user_id  # Remember which user started the bot
        asyncio.create_task(self._run_auto_loop())

    def stop_auto_trading(self):
        self.is_running = False
        self.auto_user_id = None

    async def _run_auto_loop(self):
        """Full 60-second cycle: trailing stop checks + sell signals + buy signals.
        Runs in a thread executor so it never blocks FastAPI's async event loop."""
        from database import SessionLocal
        import concurrent.futures
        loop = asyncio.get_event_loop()
        print("[AutoBot] Starting full-cycle auto-trading loop (2×ATR14 trailing stop)...")

        def _blocking_cycle():
            """Synchronous cycle — safe to call from a thread."""
            db = SessionLocal()
            try:
                return self.run_auto_cycle_db(db, user_id=self.auto_user_id)
            finally:
                db.close()

        while self.is_running:
            if self.auto_user_id:
                try:
                    # run_in_executor offloads the blocking I/O to a thread pool,
                    # keeping FastAPI's event loop fully responsive during the cycle.
                    result = await loop.run_in_executor(None, _blocking_cycle)
                    trades = result.get("executed_trades", [])
                    if trades:
                        print(f"[AutoBot] Cycle complete — {len(trades)} trade(s): {[t['ticker'] + ' ' + t['action'] for t in trades]}")
                    else:
                        print("[AutoBot] Cycle complete — no trades executed (HOLD on all positions)")
                except Exception as e:
                    import traceback
                    print(f"[AutoBot] Cycle error: {e}\n{traceback.format_exc()}")
            else:
                print("[AutoBot] No user_id set — waiting for authenticated Start Bot click")
            await asyncio.sleep(60)
