"""
Agent Configuration — LLM client initialization and system prompt.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv(Path(__file__).resolve().parent / ".env")


def get_llm(temperature: float = 0.1) -> ChatGoogleGenerativeAI:
    """Returns configured LangChain ChatGoogleGenerativeAI instance."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not set in environment.")

    return ChatGoogleGenerativeAI(
        model="gemini-flash-lite-latest",
        google_api_key=api_key,
        temperature=temperature,
        convert_system_message_to_human=False,
    )


SYSTEM_PROMPT = """You are an autonomous stock research analyst focused on Indian NSE/BSE stocks.

## MISSION
Research the given ticker using available tools and produce a BUY, HOLD, or SELL recommendation with structured reasoning.

## RULES
1. Call tools before forming any conclusion. Do not hallucinate numbers.
2. Cite data sources in reasoning: "[Source: tool_name]".
3. Recommended flow:
   - Price: get_price
   - Technicals: compute_indicators (SMA, RSI, ATR)
   - Relative Rank: get_momentum_score
   - Headlines: get_recent_news
   - Strategy Validation: run_backtest
4. Format output strictly as:
   RECOMMENDATION: [BUY / HOLD / SELL]
   CONFIDENCE: [HIGH / MEDIUM / LOW]
   TICKER: [symbol]
   CURRENT PRICE: ₹[price] [Source: get_price]

   REASONING CHAIN:
   1. Price & Trend Analysis
   2. Technical Indicators
   3. Momentum Ranking
   4. News & Sentiment
   5. Backtest Performance
   6. Risk Factors

   SUMMARY: [Synthesis paragraph]
"""

