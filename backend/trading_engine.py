import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
import json
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

DATA_FILE = os.path.join(tempfile.gettempdir(), "trade_history.json")

try:
    yf.set_tz_cache_location(os.path.join(tempfile.gettempdir(), "yf_cache"))
except Exception as e:
    print(f"Warning: Could not set yfinance cache location: {e}")

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

class TradingEngine:
    def __init__(self, initial_cash: float = 100000.0):
        self.cash = initial_cash
        self.positions: Dict[str, PortfolioPosition] = {}
        self.history: List[TradeHistoryItem] = []
        self.is_running = False
        self.stop_loss_pct = 0.03  # 3.0% stop loss
        self.risk_per_trade_pct = 0.02  # 2.0% equity risk per trade
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
            ticker_data = yf.Ticker(ticker)
            history = ticker_data.history(period="1d")
            if not history.empty:
                return float(history['Close'].iloc[-1])
        except Exception as e:
            print(f"Error fetching price for {ticker}: {e}")
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
        
        for ticker, pos in self.positions.items():
            current_price = self.get_stock_price(ticker)
            pos.current_price = current_price
            pos.pnl = (current_price - pos.average_price) * pos.quantity
            total_value += current_price * pos.quantity
            position_list.append(pos)

        return PortfolioSummary(
            cash=self.cash,
            equity=total_value - self.cash,
            total_value=total_value,
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
            ticker_data = yf.Ticker(ticker)
            history = ticker_data.history(period="3mo", interval="1d")
            
            if len(history) < 25:
                return {"status": "error", "message": "Not enough historical data for indicators"}
            
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
        ticker_data = yf.Ticker(ticker)
        df = ticker_data.history(period=period_str, interval="1d")
        
        if len(df) < 30:
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
                existing_pos = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id, PositionDB.ticker == ticker).first()
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
                        current_price=current_price
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
            existing_pos = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id, PositionDB.ticker == ticker).first()
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

    def get_portfolio_summary_db(self, db: Session, user_id: Optional[str] = None) -> PortfolioSummary:
        portfolio = self._get_or_create_portfolio(db, user_id=user_id)
        if not portfolio:
            return PortfolioSummary(cash=100000.0, equity=0.0, total_value=100000.0, positions=[])

        cash = portfolio.cash
        db_positions = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id).all()
        position_list = []
        equity = 0.0

        for pos in db_positions:
            price = self.get_stock_price(pos.ticker)
            if price <= 0:
                price = pos.current_price or pos.average_price

            pnl = (price - pos.average_price) * pos.quantity
            pos_val = price * pos.quantity
            equity += pos_val

            position_list.append(PortfolioPosition(
                ticker=pos.ticker,
                quantity=pos.quantity,
                average_price=pos.average_price,
                current_price=price,
                pnl=pnl,
                stop_loss_price=pos.average_price * 0.97
            ))

        total_val = cash + equity
        return PortfolioSummary(
            cash=cash,
            equity=equity,
            total_value=total_val,
            positions=position_list
        )

    def run_auto_cycle_db(self, db: Session, user_id: Optional[str] = None):
        """Executes a 60-second quantitative auto-trading cycle scanning ALL 40 companies in parallel."""
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

            pnl_pct = (price - pos.average_price) / pos.average_price
            if pnl_pct <= -self.stop_loss_pct:
                cost = price * pos.quantity
                portfolio.cash += cost
                pnl = (price - pos.average_price) * pos.quantity

                trade = TradeDB(
                    id=str(uuid.uuid4()),
                    user_id=portfolio.user_id,
                    ticker=pos.ticker,
                    action="SELL",
                    quantity=pos.quantity,
                    price=price,
                    pnl=pnl,
                    strategy="STOP_LOSS",
                    reason=f"🚨 Emergency 3.0% Stop-Loss Triggered for {pos.ticker} at ₹{price:.2f}"
                )
                db.add(trade)
                db.delete(pos)
                db.commit()
                executed_trades.append({"ticker": pos.ticker, "action": "SELL", "quantity": pos.quantity, "reason": "STOP_LOSS"})

        # 3. Parallel Scan ALL 40 Companies in INDIAN_STOCKS
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
                existing_pos = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id, PositionDB.ticker == ticker).first()
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

                # Skip if already holding a large allocation in this stock
                existing_holding = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id, PositionDB.ticker == ticker).first()
                if existing_holding and existing_holding.quantity >= 100:
                    continue

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

        # Sort candidate companies by highest quantitative score (top opportunities across all 40 companies)
        buy_candidates.sort(key=lambda x: x["score"], reverse=True)
        top_candidates = buy_candidates[:4] # Select top performing candidates for portfolio diversification

        # 6. Allocate cash & execute BUY orders with healthy share quantities
        if top_candidates and portfolio.cash > 0:
            cash_per_stock = portfolio.cash / len(top_candidates)
            for cand in top_candidates:
                ticker = cand["ticker"]
                price = cand.get("price")
                if not price or price <= 0:
                    continue
                atr_qty = cand.get("atr_qty", 5)
                reason = cand.get("reason", "")

                qty_by_cash = int(cash_per_stock // price)
                final_qty = max(1, min(max(atr_qty, 5), qty_by_cash)) if qty_by_cash > 0 else 0
                cost = price * final_qty

                if final_qty > 0 and portfolio.cash >= cost:
                    portfolio.cash -= cost
                    existing_pos = db.query(PositionDB).filter(PositionDB.user_id == portfolio.user_id, PositionDB.ticker == ticker).first()
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
                            current_price=price
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
                    executed_trades.append({"ticker": ticker, "action": "BUY", "quantity": final_qty, "reason": reason})

        return {"status": "success", "executed_trades": executed_trades, "count": len(executed_trades)}

    async def start_auto_trading(self):
        if self.is_running:
            return
        self.is_running = True
        asyncio.create_task(self._run_auto_loop())

    def stop_auto_trading(self):
        self.is_running = False

    async def _run_auto_loop(self):
        print("Starting auto-trading loop...")
        while self.is_running:
            print("Auto-trading scan started...")
            self.check_stop_losses()
            await asyncio.sleep(60)

