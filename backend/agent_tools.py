"""
Agent Tools — LangChain tool wrappers for trading engine functions.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from langchain_core.tools import tool

from trading_engine import TradingEngine
from constants import INDIAN_STOCKS

_engine = TradingEngine()


@tool
def get_price(ticker: str) -> str:
    """Get the current market price for a stock ticker.

    Args:
        ticker: Stock ticker symbol in NSE/BSE format (e.g. 'RELIANCE.NS')

    Returns:
        JSON string with ticker and current price in INR.
    """
    price = _engine.get_stock_price(ticker)
    return json.dumps({
        "ticker": ticker,
        "price": round(price, 2),
        "currency": "INR",
    })


@tool
def compute_indicators(ticker: str) -> str:
    """Compute technical indicators (SMA5, SMA20, RSI14, ATR14) for a stock.

    Args:
        ticker: Stock ticker symbol in NSE/BSE format (e.g. 'RELIANCE.NS')

    Returns:
        JSON string with SMA5, SMA20, RSI14, ATR14, signal, and analysis reason.
    """
    result = _engine.run_strategy(ticker, execute=False)

    if result.get("status") == "error":
        return json.dumps({
            "ticker": ticker,
            "error": result.get("message", "Failed to compute indicators"),
        })

    return json.dumps({
        "ticker": result.get("ticker", ticker),
        "price": round(result.get("price", 0.0), 2),
        "sma5": round(result.get("sma5", 0.0), 2),
        "sma20": round(result.get("sma20", 0.0), 2),
        "rsi14": round(result.get("rsi14", 0.0), 2),
        "atr14": round(result.get("atr14", 0.0), 2),
        "signal": result.get("signal", "HOLD"),
        "reason": result.get("reason", ""),
    })


@tool
def get_momentum_score(ticker: str) -> str:
    """Get the momentum score and ranking for a stock relative to tracked Indian stocks.

    Args:
        ticker: Stock ticker symbol in NSE/BSE format (e.g. 'RELIANCE.NS')

    Returns:
        JSON string with momentum score, rank, total stocks scanned, and top 5 stocks.
    """
    target_result = _engine.run_strategy(ticker, execute=False)

    if target_result.get("status") == "error":
        return json.dumps({
            "ticker": ticker,
            "error": target_result.get("message", "Failed to compute momentum score"),
        })

    target_sma5 = target_result.get("sma5", 0)
    target_sma20 = target_result.get("sma20", 1)
    target_rsi = target_result.get("rsi14", 50)
    target_sma20_safe = target_sma20 if target_sma20 > 0 else 1.0
    target_score = ((target_sma5 - target_sma20_safe) / target_sma20_safe * 100) + (target_rsi - 50)

    benchmark_list = INDIAN_STOCKS[:20]
    if not any(s["symbol"] == ticker for s in benchmark_list):
        benchmark_list = benchmark_list + [{"symbol": ticker, "name": ticker}]

    def _scan_one(stock_item):
        sym = stock_item["symbol"]
        try:
            res = _engine.run_strategy(sym, execute=False)
            if res.get("status") == "error":
                return None
            s5 = res.get("sma5", 0)
            s20 = res.get("sma20", 1)
            rsi = res.get("rsi14", 50)
            s20_safe = s20 if s20 > 0 else 1.0
            score = ((s5 - s20_safe) / s20_safe * 100) + (rsi - 50)
            return {"ticker": sym, "score": round(score, 2), "signal": res.get("signal", "HOLD")}
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=10) as executor:
        all_scores = list(executor.map(_scan_one, benchmark_list))

    all_scores = [s for s in all_scores if s is not None]
    all_scores.sort(key=lambda x: x["score"], reverse=True)

    rank = next(
        (i + 1 for i, s in enumerate(all_scores) if s["ticker"] == ticker),
        len(all_scores)
    )

    return json.dumps({
        "ticker": ticker,
        "momentum_score": round(target_score, 2),
        "signal": target_result.get("signal", "HOLD"),
        "rank": rank,
        "total_stocks": len(all_scores),
        "percentile": round((1 - rank / max(len(all_scores), 1)) * 100, 1),
        "top_5": all_scores[:5],
    })


@tool
def get_recent_news(ticker: str) -> str:
    """Fetch recent news headlines and summaries for a stock.

    Args:
        ticker: Stock ticker symbol in NSE/BSE format (e.g. 'RELIANCE.NS')

    Returns:
        JSON string with a list of recent news items.
    """
    import yfinance as yf

    try:
        t = yf.Ticker(ticker)
        raw_news = t.news

        if not raw_news:
            return json.dumps({
                "ticker": ticker,
                "news_count": 0,
                "articles": [],
                "note": "No recent news found for this ticker.",
            })

        articles = []
        for item in raw_news[:10]:
            content = item.get("content", item)
            title = content.get("title", "")
            publisher = content.get("provider", {})
            if isinstance(publisher, dict):
                publisher = publisher.get("displayName", "Unknown")

            pub_date = content.get("pubDate", "")
            summary = content.get("summary", "")
            snippet = summary if summary else title

            articles.append({
                "title": title,
                "publisher": str(publisher),
                "date": str(pub_date),
                "snippet": snippet[:300],
            })

        return json.dumps({
            "ticker": ticker,
            "news_count": len(articles),
            "articles": articles,
        })

    except Exception as e:
        return json.dumps({
            "ticker": ticker,
            "error": f"Failed to fetch news: {str(e)}",
            "news_count": 0,
            "articles": [],
        })


@tool
def run_backtest(ticker: str, months: int = 12) -> str:
    """Run a historical backtest of the SMA+RSI+ATR strategy on a stock.

    Args:
        ticker: Stock ticker symbol in NSE/BSE format (e.g. 'RELIANCE.NS')
        months: Lookback window in months (6 or 12).

    Returns:
        JSON string with backtest performance metrics.
    """
    months = max(6, min(months, 12))

    try:
        result = _engine.run_backtest(ticker=ticker, months=months, initial_capital=100000.0)

        trades_summary = []
        for t in result.trades[:10]:
            trades_summary.append({
                "entry_date": t.entry_date,
                "exit_date": t.exit_date,
                "entry_price": round(t.entry_price, 2),
                "exit_price": round(t.exit_price, 2),
                "pnl": round(t.pnl, 2),
                "pnl_pct": round(t.pnl_pct, 2),
                "exit_reason": t.exit_reason,
            })

        return json.dumps({
            "ticker": ticker,
            "backtest_months": months,
            "initial_capital": 100000.0,
            "final_equity": result.final_equity,
            "total_return_pct": result.total_return_pct,
            "sharpe_ratio": result.sharpe_ratio,
            "max_drawdown_pct": result.max_drawdown_pct,
            "win_rate": result.win_rate,
            "total_trades": result.total_trades,
            "trades": trades_summary,
        })

    except Exception as e:
        return json.dumps({
            "ticker": ticker,
            "error": f"Backtest failed: {str(e)}",
        })


AGENT_TOOLS = [get_price, compute_indicators, get_momentum_score, get_recent_news, run_backtest]
