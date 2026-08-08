"""
Live Agent Test Script.

Usage:
    python test_agent_live.py [TICKER]
"""

import sys
import os
import time

os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, "backend")

from agent_executor import run_research


def main():
    ticker = sys.argv[1] if len(sys.argv) > 1 else "RELIANCE.NS"

    print(f"Testing Research Agent for Ticker: {ticker}")
    start = time.time()

    result = run_research(ticker, verbose=True)

    elapsed = time.time() - start

    print("\n--- SUMMARY ---")
    print(f"Ticker: {result.get('ticker')}")
    print(f"Recommendation: {result.get('recommendation')}")
    print(f"Confidence: {result.get('confidence')}")
    print(f"Time Elapsed: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
