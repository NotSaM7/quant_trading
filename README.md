# Quant Trading App 📈 — Premium Trading Dashboard

A modern, high-performance quantitative trading platform built with **React**, **FastAPI**, **SQLAlchemy**, and **Supabase PostgreSQL**. Features a Spotify-inspired dark mode UI, native JWT user authentication, parallel 117-company quantitative strategy execution, ATR volatility position sizing, 2×ATR14 trailing stop protection, automated 1-click **Book Profit** capital gains cash-out, real-time **Today's P&L** split-lot tracking, plain-English retail trade rationales, 6–12 month historical backtesting, and adaptive position sizing for both small and large portfolios.

---

## ✨ Key Features & Strategy Highlights

### 💰 Automated "Book Profit" Capital Gains Cash-Out
- **1-Click Profit Booking**: Evaluates **Total Portfolio Value** against the baseline initial capital (₹100,000).
- **Selective Profit Liquidation**: Identifies and liquidates **100% of all stock positions currently in profit** (`current_price > average_price`) at live market prices.
- **Cash Realization**: Credits principal cost basis + profit directly to your cash balance while keeping non-profitable positions intact for recovery or trailing stop protection.
- **Automated Bot Re-scan**: Instantly re-initiates automated market scanning across 117 Indian stocks to detect new entry opportunities.

---

### 📊 Live "Today's P&L" — Split-Lot Accurate Calculation
- **Session P&L Tracking**: Dedicated **TODAY'S P/L** stat card displayed right beside **CASH BALANCE**, color-coded in Spotify Green (`#1DB954`) for session gains or Red (`#E91429`) for session losses.
- **Split-Lot Cost Basis**: Today's P&L is calculated in two distinct layers for mixed old+new positions:
  - `pnl_old = (live_price − prev_close) × qty_held_before_today`
  - `pnl_new = (live_price × qty_bought_today) − cost_of_today_buys`
- **Intraday Sell Handling**: When same-day sells reduce a position, the average cost per share from today's buys is clamped correctly — eliminating the common mismatch bug between clamped quantity and un-clamped cost.
- **Alphabetical Portfolio Table**: Positions are sorted A→Z and locked in place so the table never jumps or reorders on live price updates.

---

### 🚀 Performance Optimizations
- **15-Second In-Memory Price Cache** (`_PRICE_CACHE`): Live prices fetched once per ticker and cached for 15 seconds, shared across all API calls within the same process.
- **`fast_info` Lightweight Fetching**: Uses `yfinance.Ticker.fast_info` (lightweight key-value endpoint) as the primary price source — ~3–5× faster than downloading a full 5-day OHLCV DataFrame.
- **Parallel Price Fetching**: All portfolio positions are fetched simultaneously via a 16-worker `ThreadPoolExecutor`, not sequentially.
- **Single Batch DB Query**: All today's BUY trades for the entire portfolio are pre-fetched in **one** Supabase query (not N+1 queries inside the position loop), eliminating WAN roundtrip overhead to Singapore.
- **Non-Blocking Startup**: Database schema initialization runs in a background thread — FastAPI accepts requests immediately without a startup delay.
- **Connection Pooling**: SQLAlchemy engine configured with `pool_size=15`, `max_overflow=15`, `pool_pre_ping=True`, `connect_timeout=10` for stable Supabase WAN connections.

---

### ⚡ Top Live Marquee Ticker & Market Guard System
- **Top Live Ticker Bar**: Continuous smooth scrolling marquee ticker (`@keyframes tickerScroll`) streaming live Indian NSE stock quotes across the top navigation header.
- **5-Second Welcome Overlay Modal**: Smooth startup overlay featuring animated logo badge, IST Market Status badge (`OPEN` / `CLOSED` / `WEEKEND`), 4-cell schedule grid, and 5-second linear progress countdown.
- **Weekend & Off-Hours Market Guard**: Floating warning toast banner with backdrop blur (`blur(20px)`), guarding against order execution outside NSE/BSE trading hours (9:15 AM – 3:30 PM IST).

---

### ⚡ Parallel 117-Company Quantitative Strategy Engine (`SMA5 / SMA20 + RSI14 + ATR14`)
- **Parallel Multi-Threaded Scan**: Scans **ALL 117 top Indian companies** (`INDIAN_STOCKS`) in parallel using a 10-worker thread pool.
- **Quantitative Momentum Ranking**: Computes $SMA_5$, $SMA_{20}$, $RSI_{14}$, and $ATR_{14}$ for every company and ranks all stocks by Quantitative Momentum Score:
  $$\text{Score} = \frac{SMA_5 - SMA_{20}}{SMA_{20}} \times 100 + (RSI_{14} - 50)$$
- **Multi-Stock Purchase Diversification**: Allocates capital across multiple top-ranked candidates rather than focusing on a single stock.
- **2×ATR14 Trailing Stop Protection**: Each position tracks its all-time peak price. The bot automatically exits when the live price falls more than `2 × ATR14` below the peak — locking in profits on the way up.
- **Portfolio Rotation Engine**: If a currently held stock weakens to a HOLD signal and a much better-scoring BUY opportunity (score delta ≥ 15) exists in an unowned stock, capital is automatically rotated.
- **Adaptive Position Sizing**: 
  - Small portfolios (< ₹20,000): 50% max concentration per stock, ₹300 minimum trade size.
  - Standard portfolios (≥ ₹20,000): 25% max concentration per stock, ₹2,000 minimum trade size.
- **Plain-English Trade Rationales**: Generates 1–2 sentence explanations for every trade in retail-friendly language.
- **60-Second Auto-Trading Bot Ticker**: Continuous 60-second frontend ticker triggers automated market scans and syncs portfolio metrics to Supabase.

---

### 🔒 User Authentication & Isolated Supabase Portfolios
- **Native JWT Token Authentication**: Secure sign-in and account registration using `bcrypt` password hashing and JSON Web Tokens.
- **Supabase PostgreSQL Integration**: Real-time cloud database via Supabase Transaction Pooler (ap-southeast-1, IPv4).
- **Isolated User Portfolios**: Every registered trader gets an isolated portfolio balance (₹100,000 starting cash), position tracking, and personal trade history. Trades in one account never affect another.

---

### 📊 Historical Backtesting Engine (6–12 Months)
- Run 6-month or 12-month historical simulations for any NSE stock ticker.
- Interactive **Simulated Equity Curve** vs. Stock Price benchmark chart.
- Key statistical metrics: **Total Return %**, **Max Drawdown %**, **Sharpe Ratio**, **Win Rate %**, and **Total Trades**.

---

### 🎨 Premium Dark UI Aesthetic
- Modern Spotify-inspired dark mode UI built with React, Material UI, and Recharts.
- Ambient purple gradient background overlay, glassmorphic panels (`#121212`), 12px rounded corners, and vibrant electric green button glow effects (`#1ed760`).
- Smooth slide-in animation (`rowFadeIn`) on portfolio table rows with staggered delays — table rows animate in on page load but stay locked in alphabetical order during live updates.

---

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Material UI, Recharts, Vite, Axios
- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL (`psycopg2`), Pandas, NumPy, yfinance, Pydantic
- **Database**: Supabase PostgreSQL (IPv4 Transaction Pooler, ap-southeast-1)
- **Data Source**: Yahoo Finance API (`yfinance` — `fast_info` + OHLCV fallback)

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
