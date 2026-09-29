"""
Quant Trade Memory RAG — Episodic memory store and semantic retriever using Supabase pgvector.
"""

import os
import json
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from database import engine, SessionLocal, TradeEpisodeDB, HAS_PGVECTOR

_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()


def get_embedding_client() -> GoogleGenerativeAIEmbeddings:
    """Returns configured Google Gemini embedding client (768 output dimensions)."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not configured for RAG embeddings.")

    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=api_key,
        output_dimensionality=768,
    )


def classify_market_regime(sma_gap_pct: float, rsi14: float, atr_pct: float) -> str:
    """Classifies the market regime at the time of trade setup."""
    if rsi14 >= 70:
        return "OVERBOUGHT_MOMENTUM"
    elif atr_pct >= 2.5:
        return "HIGH_VOLATILITY_CHOP"
    elif sma_gap_pct > 2.0 and rsi14 >= 55:
        return "STRONG_BULLISH_TREND"
    elif abs(sma_gap_pct) <= 1.2 and 46.0 <= rsi14 <= 58.0:
        return "SIDEWAYS_CONSOLIDATION"
    elif sma_gap_pct < 0 or rsi14 < 45:
        return "BEARISH_PULLBACK"
    else:
        return "MODERATE_UPTREND"


def generate_episode_reflection(
    ticker: str,
    entry_date: str,
    exit_date: str,
    entry_price: float,
    exit_price: float,
    pnl_pct: float,
    exit_reason: str,
    sma_gap_pct: float,
    rsi14: float,
    atr_pct: float,
    market_regime: str,
) -> str:
    """Generates rich semantic narrative for a trade episode."""
    sym = ticker.replace(".NS", "").replace(".BO", "")
    outcome_str = "PROFITABLE" if pnl_pct > 0 else "LOSS"

    if "STOP_LOSS" in exit_reason.upper():
        trap_note = "Suffered false breakout drawdown and hit stop loss before upward continuation."
    elif pnl_pct > 0:
        trap_note = "Healthy trend confirmation following indicator signal."
    else:
        trap_note = "Exited on reverse trend crossover with mild loss."

    return (
        f"[{sym}] Setup in {market_regime} regime on {entry_date}. "
        f"Entry price ₹{entry_price:.2f} with SMA gap {sma_gap_pct:+.1f}%, RSI14 at {rsi14:.1f}, "
        f"and daily ATR volatility {atr_pct:.1f}%. Closed on {exit_date} at ₹{exit_price:.2f} "
        f"({pnl_pct:+.1f}% P&L, {outcome_str}) via {exit_reason}. Pattern: {trap_note}"
    )


def store_trade_episode(data: Dict[str, Any], db: Optional[Session] = None) -> TradeEpisodeDB:
    """Stores a single trade episode with generated embedding into Supabase/PostgreSQL."""
    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True

    try:
        ticker = data["ticker"]
        entry_date = data["entry_date"]
        exit_date = data["exit_date"]
        action = data.get("action", "BUY")
        entry_price = float(data["entry_price"])
        exit_price = float(data["exit_price"])
        quantity = int(data.get("quantity", 1))
        pnl = float(data["pnl"])
        pnl_pct = float(data["pnl_pct"])
        exit_reason = data.get("exit_reason", "Strategy Exit")
        sma_gap_pct = float(data.get("sma_gap_pct", 0.0))
        rsi14 = float(data.get("rsi14", 50.0))
        atr_pct = float(data.get("atr_pct", 2.0))

        regime = data.get("market_regime")
        if not regime:
            regime = classify_market_regime(sma_gap_pct, rsi14, atr_pct)

        reflection = data.get("reflection_text")
        if not reflection:
            reflection = generate_episode_reflection(
                ticker=ticker,
                entry_date=entry_date,
                exit_date=exit_date,
                entry_price=entry_price,
                exit_price=exit_price,
                pnl_pct=pnl_pct,
                exit_reason=exit_reason,
                sma_gap_pct=sma_gap_pct,
                rsi14=rsi14,
                atr_pct=atr_pct,
                market_regime=regime,
            )

        # Generate embedding vector
        emb_client = get_embedding_client()
        vector = emb_client.embed_query(reflection)

        episode = TradeEpisodeDB(
            id=str(uuid.uuid4()),
            ticker=ticker,
            entry_date=entry_date,
            exit_date=exit_date,
            action=action,
            entry_price=entry_price,
            exit_price=exit_price,
            quantity=quantity,
            pnl=pnl,
            pnl_pct=pnl_pct,
            exit_reason=exit_reason,
            sma_gap_pct=sma_gap_pct,
            rsi14=rsi14,
            atr_pct=atr_pct,
            market_regime=regime,
            reflection_text=reflection,
            embedding=vector if (HAS_PGVECTOR and engine.dialect.name == "postgresql") else json.dumps(vector),
        )

        db.add(episode)
        db.commit()
        db.refresh(episode)
        return episode
    finally:
        if own_session:
            db.close()


def search_similar_trade_episodes(
    ticker: str,
    sma_gap_pct: float,
    rsi14: float,
    atr_pct: float,
    top_k: int = 5,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """Retrieves top_k analogous historical trade episodes using pgvector cosine similarity."""
    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True

    try:
        regime = classify_market_regime(sma_gap_pct, rsi14, atr_pct)
        sym = ticker.replace(".NS", "").replace(".BO", "")

        query_text = (
            f"Technical setup for {sym} in {regime} regime with "
            f"SMA gap {sma_gap_pct:+.1f}%, RSI {rsi14:.1f}, and daily ATR volatility {atr_pct:.1f}%."
        )

        emb_client = get_embedding_client()
        query_vector = emb_client.embed_query(query_text)

        matches = []

        if engine.dialect.name == "postgresql" and HAS_PGVECTOR:
            # Native pgvector cosine distance using SQLAlchemy ORM
            dist_expr = TradeEpisodeDB.embedding.cosine_distance(query_vector)
            ticker_priority = (TradeEpisodeDB.ticker != ticker)

            res = (
                db.query(TradeEpisodeDB, dist_expr.label("distance"))
                .order_by(ticker_priority, dist_expr.asc())
                .limit(top_k)
                .all()
            )

            for ep, dist in res:
                distance_val = float(dist) if dist is not None else 1.0
                sim = round(max(0.0, 1.0 - distance_val) * 100, 1)
                matches.append({
                    "ticker": ep.ticker,
                    "entry_date": ep.entry_date,
                    "exit_date": ep.exit_date,
                    "entry_price": round(ep.entry_price, 2),
                    "exit_price": round(ep.exit_price, 2),
                    "pnl_pct": round(ep.pnl_pct, 2),
                    "exit_reason": ep.exit_reason,
                    "sma_gap_pct": round(ep.sma_gap_pct, 2),
                    "rsi14": round(ep.rsi14, 2),
                    "atr_pct": round(ep.atr_pct, 2),
                    "market_regime": ep.market_regime,
                    "reflection": ep.reflection_text,
                    "similarity_score_pct": sim,
                })
        else:
            # Fallback for SQLite: compute in Python
            all_episodes = db.query(TradeEpisodeDB).all()
            q_vec = np.array(query_vector, dtype=float)
            norm_q = np.linalg.norm(q_vec) + 1e-9

            scored = []
            for ep in all_episodes:
                if ep.embedding:
                    vec = np.array(json.loads(ep.embedding) if isinstance(ep.embedding, str) else ep.embedding, dtype=float)
                    sim = float(np.dot(q_vec, vec) / (norm_q * (np.linalg.norm(vec) + 1e-9)))
                    # Boost same ticker
                    boosted_sim = sim + (0.15 if ep.ticker == ticker else 0.0)
                    scored.append((boosted_sim, sim, ep))

            scored.sort(key=lambda x: x[0], reverse=True)
            for _, raw_sim, ep in scored[:top_k]:
                matches.append({
                    "ticker": ep.ticker,
                    "entry_date": ep.entry_date,
                    "exit_date": ep.exit_date,
                    "entry_price": round(ep.entry_price, 2),
                    "exit_price": round(ep.exit_price, 2),
                    "pnl_pct": round(ep.pnl_pct, 2),
                    "exit_reason": ep.exit_reason,
                    "sma_gap_pct": round(ep.sma_gap_pct, 2),
                    "rsi14": round(ep.rsi14, 2),
                    "atr_pct": round(ep.atr_pct, 2),
                    "market_regime": ep.market_regime,
                    "reflection": ep.reflection_text,
                    "similarity_score_pct": round(max(0.0, raw_sim) * 100, 1),
                })

        # Calculate regime summary statistics
        total = len(matches)
        wins = [m for m in matches if m["pnl_pct"] > 0]
        losses = [m for m in matches if m["pnl_pct"] <= 0]
        stop_losses = [m for m in matches if "STOP_LOSS" in m["exit_reason"].upper()]

        win_rate = round((len(wins) / total) * 100, 1) if total > 0 else 0.0
        avg_pnl = round(sum(m["pnl_pct"] for m in matches) / total, 2) if total > 0 else 0.0
        stop_loss_rate = round((len(stop_losses) / total) * 100, 1) if total > 0 else 0.0

        # Trap warning logic
        is_high_risk_trap = False
        trap_warning = ""
        if total >= 3 and win_rate < 40.0:
            is_high_risk_trap = True
            trap_warning = (
                f"CAUTION: In {total} analogous historical setups matching this regime, "
                f"win rate is only {win_rate}% with {len(stop_losses)} stop-loss triggers. "
                f"High probability of false breakout trap."
            )
        elif win_rate >= 60.0:
            trap_warning = (
                f"FAVORABLE: {win_rate}% of analogous historical setups in this regime achieved positive returns."
            )
        else:
            trap_warning = (
                f"BALANCED: Historical performance in this regime is mixed ({win_rate}% win rate)."
            )

        return {
            "query_ticker": ticker,
            "detected_regime": regime,
            "analogous_setups_found": total,
            "regime_win_rate_pct": win_rate,
            "regime_avg_pnl_pct": avg_pnl,
            "stop_loss_hit_rate_pct": stop_loss_rate,
            "is_high_risk_trap": is_high_risk_trap,
            "regime_summary": trap_warning,
            "episodes": matches,
        }
    finally:
        if own_session:
            db.close()
