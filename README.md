# Quant Trading App 📈

A modern, high-performance quantitative trading dashboard built with **React**, **FastAPI**, and **Python**. This project features a sleek, Spotify-inspired dark mode UI and powerful automated trading strategies.

![Dashboard Screenshot 1](dashboard_1.png)
![Dashboard Screenshot 2](dashboard_2.png)

## ✨ Features

### 🚀 Real-time Market Data
- Live stock prices for top Indian companies (e.g., RELIANCE, TCS, INFY).
- Interactive charts and visual indicators.

### 💼 Portfolio Management
- Track your **Holdings**, **Total Balance**, and **Profit/Loss** in real-time.
- Visual breakdown of your portfolio allocation.

### 🤖 Automated Trading Strategies
- **SMA Crossover Strategy**: Automatically executes buy/sell orders based on Simple Moving Average crossovers.
- Start/Stop automated trading with a single click.
- Real-time signals and trade execution.

### 📊 Advanced Analysis
- Detailed investment analysis and performance metrics.
- Trade history tracking.

### 🎨 Premium UI/UX
- **Dark Mode**: A beautiful, eye-friendly interface inspired by Spotify.
- **Responsive Design**: Works seamlessly across different screen sizes.
- **Interactive Elements**: Smooth animations and intuitive navigation.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Material UI, Vite
- **Backend**: Python, FastAPI, Pandas, NumPy, yfinance
- **Data**: Yahoo Finance API

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/NotSaM7/quant_trading.git
    cd quant_trading
    ```

2.  **Setup Backend**
    ```bash
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn main:app --reload
    ```

3.  **Setup Frontend**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

4.  **Open Dashboard**
    Navigate to `http://localhost:5173` in your browser.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
