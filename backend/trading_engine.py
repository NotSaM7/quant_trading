import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import json
import asyncio
import uuid
from models import StockData, PortfolioPosition, PortfolioSummary, TradeSignal, TradeRequest, TradeHistoryItem, AnalysisMetrics
from constants import INDIAN_STOCKS
import os
import tempfile

# Use /tmp for Vercel, or local directory for development if writable
# For Vercel, we must use /tmp, but remember it's ephemeral
DATA_FILE = os.path.join(tempfile.gettempdir(), "trade_history.json")

class TradingEngine:
    def __init__(self, initial_cash: float = 100000.0):
        self.cash = initial_cash
        self.positions: Dict[str, PortfolioPosition] = {}
        self.history: List[TradeHistoryItem] = []
        self.is_running = False
        self.load_history()

    def load_history(self):
        try:
            with open(DATA_FILE, "r") as f:
                data = json.load(f)
                self.history = [TradeHistoryItem(**item) for item in data]
                # Re-calculate cash/positions based on history if needed, 
                # but for now we'll just keep the history for analysis 
                # and assume cash/positions are transient or reset on restart for this MVP version.
                # ideally we should persist portfolio state too.
        except FileNotFoundError:
            self.history = []

    def save_history(self):
        try:
            with open(DATA_FILE, "w") as f:
                json.dump([item.dict() for item in self.history], f, default=str)
        except Exception as e:
            print(f"Error saving history: {e}")

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
        # Fetch real-time data using yfinance
        try:
            ticker_data = yf.Ticker(ticker)
            # rapid fetch for latest price
            history = ticker_data.history(period="1d")
            if not history.empty:
                return history['Close'].iloc[-1]
        except Exception as e:
            print(f"Error fetching price for {ticker}: {e}")
        return 0.0

    def get_portfolio_summary(self) -> PortfolioSummary:
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

    def execute_trade(self, trade_request: TradeRequest):
        print(f"Executing trade: {trade_request}")
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
                   # Update average price
                   total_cost_existing = pos.quantity * pos.average_price
                   total_cost_new = total_cost_existing + cost
                   pos.quantity += quantity
                   pos.average_price = total_cost_new / pos.quantity
                else:
                    self.positions[ticker] = PortfolioPosition(
                        ticker=ticker,
                        quantity=quantity,
                        average_price=current_price,
                        current_price=current_price,
                        pnl=0.0
                    )
                print(f"Bought {quantity} {ticker} at {current_price}")
                
                # Record in history
                history_item = TradeHistoryItem(
                    id=str(uuid.uuid4()),
                    ticker=ticker,
                    action="BUY",
                    quantity=quantity,
                    price=current_price,
                    timestamp=datetime.now(),
                    strategy="MANUAL" # Default, can be overridden if passed in context, but simplest here
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
                if pos.quantity == 0:
                    del self.positions[ticker]
                print(f"Sold {quantity} {ticker} at {current_price}")
                
                # Calculate PnL for this specific sale (simplified FIFO or AVG)
                # Using average price from position before it was reduced/removed
                avg_price = pos.average_price 
                pnl = (current_price - avg_price) * quantity
                
                # Record in history
                history_item = TradeHistoryItem(
                    id=str(uuid.uuid4()),
                    ticker=ticker,
                    action="SELL",
                    quantity=quantity,
                    price=current_price,
                    timestamp=datetime.now(),
                    pnl=pnl,
                    strategy="MANUAL"
                )
                self.history.append(history_item)
                self.save_history()

                return {"status": "success", "message": f"Sold {quantity} {ticker}"}
            else:
                 return {"status": "error", "message": "Insufficient quantity"}
        
        return {"status": "error", "message": "Invalid action"}

    # Placeholder for strategy execution
    def run_strategy(self, ticker: str, quantity: int = 5, use_all_cash: bool = False, execute: bool = True):
        print(f"Running strategy for {ticker}, execute={execute}")
        
        # 1. Fetch historical data (1 mo, daily)
        try:
            ticker_data = yf.Ticker(ticker)
            history = ticker_data.history(period="1mo", interval="1d")
            
            if len(history) < 20:
                return {"status": "error", "message": "Not enough data for SMA strategy"}
            
            # 2. Calculate Indicators (SMA 5 and SMA 20)
            history['SMA5'] = history['Close'].rolling(window=5).mean()
            history['SMA20'] = history['Close'].rolling(window=20).mean()
            
            last_close = history['Close'].iloc[-1]
            last_sma5 = history['SMA5'].iloc[-1]
            last_sma20 = history['SMA20'].iloc[-1]
            
            # 3. Generate Signal
            signal = "HOLD"
            reason = "No crossover detected"
            
            if last_sma5 > last_sma20:
                signal = "BUY"
                reason = "SMA5 crossed above SMA20 (Bullish)"
            elif last_sma5 < last_sma20:
                signal = "SELL"
                reason = "SMA5 crossed below SMA20 (Bearish)"
                
            # 4. Execute Trade if Signal Matches AND execute flag is True
            trade_result = None
            
            if execute:
                if signal == "BUY":
                     qty_to_buy = quantity
                     
                     if use_all_cash and last_close > 0:
                         qty_to_buy = int(self.cash // last_close)
                         if qty_to_buy < 1:
                             reason += " - Insufficient cash"
                             qty_to_buy = 0
                     
                     if qty_to_buy > 0:
                         if self.cash > (last_close * qty_to_buy):
                             trade_result = self.execute_trade(TradeRequest(
                                 ticker=ticker, action="BUY", quantity=qty_to_buy
                             ))
                         else:
                             reason += " - Insufficient cash"
                     else:
                        if ticker in self.positions:
                            reason += " - Holding (No cash)"
                        else:
                            reason += " - Insufficient cash"
                        
                elif signal == "SELL":
                    if ticker in self.positions:
                        qty_to_sell = self.positions[ticker].quantity
                        trade_result = self.execute_trade(TradeRequest(
                            ticker=ticker, action="SELL", quantity=qty_to_sell
                        ))
                    else:
                        reason += " - No position to sell"

            return {
                "ticker": ticker,
                "price": float(last_close),
                "sma5": float(last_sma5) if not pd.isna(last_sma5) else None,
                "sma20": float(last_sma20) if not pd.isna(last_sma20) else None,
                "signal": signal,
                "reason": reason,
                "trade_executed": trade_result
            }

        except Exception as e:
            print(f"Strategy error: {e}")
            return {"status": "error", "message": str(e)}

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
            
            buy_candidates = []
            
            # Pass 1: Scan all stocks for signals
            for stock in INDIAN_STOCKS:
                if not self.is_running: break
                
                ticker = stock["symbol"]
                await asyncio.sleep(0.5) # Reduced sleep for faster scan
                
                try:
                    # Run strategy in analysis mode only (execute=False)
                    # We will handle execution after gathering all candidates to distribute cash
                    result = self.run_strategy(ticker, execute=False)
                    
                    if result.get("status") == "error": continue

                    signal = result.get("signal")
                    price = result.get("price")
                    
                    if signal == "SELL":
                        # Execute SELL immediately to free up cash for buys
                        self.run_strategy(ticker, execute=True)
                        
                    elif signal == "BUY":
                        buy_candidates.append({
                            "ticker": ticker,
                            "price": price
                        })
                        print(f"Found BUY candidate: {ticker} at {price}")
                    
                except Exception as e:
                    print(f"Error in auto-loop for {ticker}: {e}")
            
            # Pass 2: Distribute cash and execute buys
            if self.is_running and buy_candidates:
                num_buys = len(buy_candidates)
                if num_buys > 0 and self.cash > 0:
                    print(f"Distributing ${self.cash} among {num_buys} stocks")
                    cash_per_stock = self.cash / num_buys
                    
                    for candidate in buy_candidates:
                        ticker = candidate["ticker"]
                        price = candidate["price"]
                        
                        qty = int(cash_per_stock // price)
                        if qty > 0:
                            print(f"Allocating {cash_per_stock} to {ticker} -> Buy {qty}")
                            self.execute_trade(TradeRequest(
                                ticker=ticker, action="BUY", quantity=qty
                            ))
                        else:
                            print(f"Skipping {ticker}: Insufficient allocated cash ({cash_per_stock}) for price {price}")
            
            print("Auto-trading scan finished. Sleeping 60s.")
            await asyncio.sleep(60)
