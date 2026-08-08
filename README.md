# Quant Trading App 📈 — Premium Trading Dashboard

A modern, high-performance quantitative trading platform built with **React**, **FastAPI**, **SQLAlchemy**, and **Supabase PostgreSQL**. Features a Spotify-inspired dark mode UI, native JWT user authentication, parallel NSE stocks quantitative strategy execution, ATR volatility position sizing, automated 1-click **Book Profit** capital gains cash-out, real-time **Today's P/L** tracking, stop-loss protection, plain-English retail trade rationales, and 6–12 month historical backtesting.

![QuantBot Dashboard Overview](./dashboard_main.png)
![QuantBot Performance & Analytics View](./analysis_view.png)
![QuantBot Trade History & Strategy Log](./trade_history_table.png)

> ℹ️ **Demonstration & Trial Notice**: All screenshots, portfolio figures, stock prices, and P&L metrics displayed above are generated during system trial testing runs for UI demonstration purposes. Values may or may not reflect real live financial data and do not represent guaranteed financial returns or actual monetary transactions.

---

## ✨ Key Features & Strategy Highlights

### 💰 Automated "Book Profit" Capital Gains Cash-Out
- **1-Click Profit Booking**: Evaluates **Total Portfolio Value** against the baseline initial capital (₹100,000).
- **Selective Profit Liquidation**: Identifies and liquidates **100% of all stock positions currently in profit** (`current_price > average_price` or `pnl > 0`) at live market prices.
- **Cash Realization**: Credits principal cost basis + profit directly to your cash balance while keeping non-profitable positions intact for recovery or trailing stop-loss protection.
- **Automated Bot Re-scan**: Instantly re-initiates automated market scanning across Indian stocks (`RELIANCE.NS`, `TCS.NS`, `INFY.NS`, `HCLTECH.NS`, `WIPRO.NS`, `TITAN.NS`) to detect new entry opportunities.

---

### 📊 Live "Today's P/L" Stat Card & Summary Metrics
- **Session P&L Tracking**: Dedicated **TODAY'S P/L** stat card displayed right beside **CASH BALANCE**, color-coded in Spotify Green (`#1DB954`) for session gains or Red (`#E91429`) for session losses.
- **Pure Intraday Metrics**: Calculates realized P&L from trades executed today (since 12:00 AM midnight) plus intraday unrealized position movement, excluding older trades from prior days.
- **Weighted Average Cost Basis (`AVG BUY PRICE`)**: Table columns explicitly calculate the weighted average purchase price across multiple order executions for precise position P&L tracking.

---

### ⚡ Top Live Marquee Ticker & Market Guard System
- **Top Live Ticker Bar**: Continuous smooth scrolling marquee ticker (`@keyframes tickerScroll`) streaming live Indian NSE stock quotes across the top navigation header.
- **5-Second Welcome Overlay Modal**: Smooth startup overlay featuring animated logo badge, IST Market Status badge (`OPEN` / `CLOSED` / `WEEKEND`), 4-cell schedule grid, and 5-second linear progress countdown.
- **Weekend & Off-Hours Market Guard**: Floating warning toast banner (`#mkt-closed-toast`) with backdrop blur (`blur(20px)`), guarding against order execution outside NSE/BSE trading hours (9:15 AM – 3:30 PM IST).

---

### ⚡ Parallel NSE Stocks Quantitative Strategy Engine (`SMA5 / SMA20 + RSI14 + ATR14`)
- **Parallel Multi-Threaded Scan**: Scans **NSE stocks** (`INDIAN_STOCKS`) in parallel using a 10-worker thread pool in ~1.8 seconds.
- **Quantitative Momentum Ranking**: Computes $SMA_5$, $SMA_{20}$, $RSI_{14}$, and $ATR_{14}$ for every company and ranks NSE stocks by Quantitative Momentum Score:
  $$\text{Score} = \frac{SMA_5 - SMA_{20}}{SMA_{20}} \times 100 + (RSI_{14} - 50)$$
- **Multi-Stock Purchase Diversification**: Allocates capital across the top 4 candidate companies rather than focusing on a single stock.
- **Automated Stop-Loss Protection**: Emergency monitor checks active positions during every pass. Positions incurring a drawdown of $\ge 3.0\%$ trigger an automated `STOP_LOSS` market sell.
- **Format 1 Retail Trade Rationales**: Generates 1–2 plain-English sentences for every trade explaining the technical indicator crossovers ($SMA_5$, $SMA_{20}$, $RSI_{14}$, $ATR_{14}$) without complex jargon.
- **60-Second Auto-Trading Bot Ticker**: Continuous 60-second ticker in the frontend triggers automated market scans and syncs portfolio metrics directly to Supabase.

---

### 🔒 User Authentication & Isolated Supabase Portfolios
- **Native JWT Token Authentication**: Secure sign-in and account registration using `bcrypt` password hashing and JSON Web Tokens.
- **Supabase PostgreSQL Integration**: Real-time cloud database connection via Supabase Transaction Pooler (IPv4).
- **Isolated User Portfolios**: Every registered trader gets an isolated portfolio balance (₹100,000 starting cash), position tracking, and personal trade history.

---

### 📊 Historical Backtesting Engine (6–12 Months)
- Run 6-month or 12-month historical simulations for any NSE stock ticker.
- Interactive **Simulated Equity Curve** vs. Stock Price benchmark chart.
- Key statistical metrics: **Total Return %**, **Max Drawdown %**, **Sharpe Ratio**, **Win Rate %**, and **Total Trades**.

---

### 🎨 Premium Dark UI Aesthetic
- Modern Spotify-inspired dark mode UI built with React, Material UI, and Recharts.
- Ambient purple gradient background overlay (`linear-gradient(180deg, rgba(67, 35, 113, 0.6) ...)`), glassmorphic panels (`#121212`), 12px rounded corners, and vibrant electric green button glow effects (`#1ed760`).

---

## 🤖 Autonomous Stock Research Agent (Agentic AI)

An agentic AI feature built into the platform: given any Indian stock ticker (e.g., `RELIANCE.NS`, `TCS.NS`, `INFY.NS`), an LLM dynamically plans its research strategy, executes 5 specialized tools in sequence, and generates a BUY/HOLD/SELL recommendation backed by a transparent reasoning trace with inline source citations.

---

### 🧠 Why Agent Architecture vs. Fixed Pipeline?

The app's original trading scanner follows a **fixed pipeline** (`scan → compute SMA/RSI/ATR → rank momentum`). While efficient for bulk screening, fixed pipelines suffer from two major limitations in deep qualitative & quantitative research:

1. **Inflexible Execution Paths**: A fixed pipeline executes the exact same steps regardless of intermediate data. If news is sparse or data is missing, fixed pipelines break or generate uniform fallback outputs.
2. **Inability to Synthesize Mixed Signals**: Quantitative indicators (e.g., bullish $SMA_5 > SMA_{20}$ crossover) can directly contradict qualitative news (e.g., geopolitical refinery risk) or historical backtest reality (e.g., 20% win rate). An **Agent Reasoning Layer** evaluates conflicting signals dynamically before making a recommendation.

---

### 🛠️ Why LangChain (ReAct Pattern) over Custom Reasoning Loops?

We selected **LangChain's ReAct (Reasoning + Acting)** framework (`create_react_agent`) over a custom `while` loop for several production reasons:

- **Structured `Thought → Action → Observation` Cycles**: Standardized message objects (`AIMessage`, `ToolMessage`) keep prompt context clean without manual state tracking.
- **Native Tool Binding**: `@tool` decorators enforce Pydantic type safety, schema generation, and argument parsing automatically.
- **Graph Stream Support**: Enables real-time step-by-step streaming (`agent.stream()`) so the UI can display live tool execution progress as it happens.
- **Built-in Error Recovery**: Gracefully catches tool execution exceptions, returning structured error JSON to the model rather than crashing the application server.

---

### 🧰 Agent Tool Inventory

| Tool | Source Logic | Purpose & Usage in Reasoning |
|---|---|---|
| `get_price(ticker)` | `TradingEngine.get_stock_price()` | Establishes current live closing price in INR (₹). Always called first to set baseline valuation. |
| `compute_indicators(ticker)` | `TradingEngine.run_strategy(execute=False)` | Computes $SMA_5$, $SMA_{20}$, $RSI_{14}$, $ATR_{14}$, short-term trend crossover, and technical BUY/HOLD/SELL signal. |
| `get_momentum_score(ticker)` | Parallel 20-Stock Scan | Computes momentum score and ranks stock against top benchmark peers (percentile rank). |
| `get_recent_news(ticker)` | `yfinance .news` | Fetches up to 10 live news headlines/summaries to assess qualitative market sentiment. |
| `run_backtest(ticker, months)` | `TradingEngine.run_backtest()` | Runs 12-month historical strategy backtest to measure Sharpe Ratio, Max Drawdown, and Win Rate %. |

---

### 📋 Full Worked Reasoning Example (`RELIANCE.NS`)

```markdown
**RECOMMENDATION: HOLD**
**CONFIDENCE: MEDIUM**
**TICKER: RELIANCE.NS**
**CURRENT PRICE: ₹1,334.80 [Source: get_price]**

---

**REASONING CHAIN:**

1. **Price & Trend Analysis**
   - Current price of RELIANCE.NS is ₹1,334.80 [Source: get_price].
   - SMA5 (₹1,309.94) sits 1.0% above SMA20 (₹1,297.44) [Source: compute_indicators].
   - Reflects an early-stage short-term bullish crossover [Source: compute_indicators].

2. **Technical Indicators**
   - RSI14 is 52.71 (neutral buying momentum) [Source: compute_indicators].
   - ATR14 is ₹22.89 (1.72% daily price volatility) [Source: compute_indicators].

3. **Momentum Ranking**
   - Momentum score of 3.67 places RELIANCE at Rank #14 out of 20 benchmark stocks (30th percentile) [Source: get_momentum_score].
   - Peer leaders like HCLTECH (34.99) and LT (29.52) show stronger relative momentum.

4. **News & Sentiment**
   - Promoters increased stake following stock slump, Q1 earnings beat expectations [Source: get_recent_news].
   - Partnership with Kim Kardashian's SKIMS & diesel exports to Europe [Source: get_recent_news].

5. **Backtest Performance**
   - 12-month backtest return: -6.78%, Sharpe Ratio: -0.88, Win Rate: 20% across 10 trades [Source: run_backtest].
   - Highlights high susceptibility to false breakout signals during sideways phases.

---

**SUMMARY:**
RELIANCE.NS displays short-term technical strength [Source: compute_indicators], but is offset by weak relative ranking (rank 14/20) [Source: get_momentum_score] and a poor 12-month backtest record (-6.78% return, 20% win rate) [Source: run_backtest]. A **HOLD** stance is recommended.
```

---

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Material UI, Recharts, Vite, Axios
- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL (`psycopg2`), Pandas, NumPy, yfinance, Pydantic
- **Database**: Supabase PostgreSQL (IPv4 Transaction Pooler)
- **Data Source**: Yahoo Finance API

---

## 🚀 Installation & Setup

### Prerequisites
- Python 3.9+
- Node.js 16+

---

### 🪟 Windows Setup (PowerShell)

1. **Clone the repository**
   ```powershell
   git clone https://github.com/NotSaM7/quant_trading.git
   cd quant_trading
   ```

2. **Setup & Run Backend**
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. **Setup & Run Frontend** *(in a new PowerShell window)*
   ```powershell
   cd quant_trading\frontend
   npm install
   npm run dev
   ```

4. **Open Dashboard**
   Navigate to `http://localhost:5173` in your browser.

---

### 🍎 macOS / Linux Setup (Terminal)

1. **Clone the repository**
   ```bash
   git clone https://github.com/NotSaM7/quant_trading.git
   cd quant_trading
   ```

2. **Setup & Run Backend**
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. **Setup & Run Frontend** *(in a new Terminal window)*
   ```bash
   cd quant_trading/frontend
   npm install
   npm run dev
   ```

4. **Open Dashboard**
   Navigate to `http://localhost:5173` in your browser.

---

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request or open an Issue.
