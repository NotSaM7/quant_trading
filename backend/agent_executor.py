"""
Agent Executor — Execution engine for autonomous stock research logic.
"""

import json
import re
import uuid
import difflib
import time as _time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from langgraph.prebuilt import create_react_agent

from agent_config import get_llm, SYSTEM_PROMPT
from agent_tools import AGENT_TOOLS
from database import AgentResearchLogDB
from constants import INDIAN_STOCKS


def resolve_ticker_symbol(user_input: str) -> str:
    """Fuzzy-resolves user input to a valid NSE ticker symbol."""
    cleaned = (user_input or "").strip().upper()
    if not cleaned:
        return "RELIANCE.NS"

    symbols = [s["symbol"] for s in INDIAN_STOCKS]
    if cleaned in symbols:
        return cleaned

    clean_no_ext = cleaned.replace(".NS", "").replace(".BO", "")
    for s in symbols:
        if s.replace(".NS", "").replace(".BO", "") == clean_no_ext:
            return s

    user_lower = user_input.strip().lower()

    for stock in INDIAN_STOCKS:
        sym_clean = stock["symbol"].replace(".NS", "").replace(".BO", "").lower()
        name_clean = stock["name"].lower()

        if user_lower == sym_clean:
            return stock["symbol"]
        if user_lower in name_clean or name_clean.startswith(user_lower):
            return stock["symbol"]

    candidate_map = {}
    for stock in INDIAN_STOCKS:
        sym_clean = stock["symbol"].replace(".NS", "").replace(".BO", "").lower()
        candidate_map[sym_clean] = stock["symbol"]
        candidate_map[stock["name"].lower()] = stock["symbol"]

    matches = difflib.get_close_matches(user_lower, candidate_map.keys(), n=1, cutoff=0.35)
    if matches:
        return candidate_map[matches[0]]

    if not (cleaned.endswith(".NS") or cleaned.endswith(".BO")):
        return f"{cleaned}.NS"
    return cleaned


def create_research_agent():
    """Creates a ReAct agent instance with research tools."""
    llm = get_llm()
    return create_react_agent(
        model=llm,
        tools=AGENT_TOOLS,
        prompt=SYSTEM_PROMPT,
    )


def run_research(ticker: str, verbose: bool = True) -> dict:
    """Runs research analysis on a ticker symbol and returns execution trace."""
    ticker = resolve_ticker_symbol(ticker)
    agent = create_research_agent()

    user_message = f"Research stock {ticker}. Gather data using tools and provide a recommendation."

    steps = []
    final_response = ""
    structured_trace: List[Dict[str, Any]] = []

    max_retries = 3
    for attempt in range(max_retries):
        try:
            steps = []
            final_response = ""
            structured_trace = []
            tool_calls_by_id = {}

            for event in agent.stream(
                {"messages": [("user", user_message)]},
                stream_mode="updates",
            ):
                for node_name, node_output in event.items():
                    messages = node_output.get("messages", [])

                    for msg in messages:
                        if hasattr(msg, "tool_calls") and msg.tool_calls:
                            for tc in msg.tool_calls:
                                tc_id = tc.get("id") or str(len(structured_trace) + 1)
                                step_num = len(structured_trace) + 1
                                step_item = {
                                    "step_number": step_num,
                                    "tool": tc["name"],
                                    "arguments": tc["args"],
                                    "result": "",
                                    "status": "pending",
                                }
                                structured_trace.append(step_item)
                                tool_calls_by_id[tc_id] = step_item
                                tool_calls_by_id[tc["name"]] = step_item

                                steps.append({
                                    "type": "tool_call",
                                    "tool": tc["name"],
                                    "args": tc["args"],
                                })

                                if verbose:
                                    print(f"\n🔧 TOOL CALL [{step_num}]: {tc['name']}")

                        elif msg.type == "tool":
                            tool_name = getattr(msg, "name", "tool")
                            tc_id = getattr(msg, "tool_call_id", None)
                            result_str = str(msg.content)

                            matched_step = tool_calls_by_id.get(tc_id) or tool_calls_by_id.get(tool_name)
                            if matched_step:
                                matched_step["result"] = result_str
                                matched_step["status"] = "success"
                            else:
                                structured_trace.append({
                                    "step_number": len(structured_trace) + 1,
                                    "tool": tool_name,
                                    "arguments": {},
                                    "result": result_str,
                                    "status": "success",
                                })

                            steps.append({
                                "type": "observation",
                                "tool": tool_name,
                                "result": result_str[:500],
                            })

                        elif msg.type == "ai" and not getattr(msg, "tool_calls", None):
                            if isinstance(msg.content, list):
                                text_parts = [b.get("text", "") if isinstance(b, dict) else str(b) for b in msg.content]
                                text_content = "\n".join([t for t in text_parts if t])
                            else:
                                text_content = str(msg.content)

                            if text_content.strip():
                                final_response = text_content
                                steps.append({
                                    "type": "final_answer",
                                    "content": text_content,
                                })

            if final_response.strip():
                break

        except Exception as e:
            error_str = str(e)
            if any(err in error_str for err in ["429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE", "high demand"]):
                wait_time = 10 * (attempt + 1)
                if verbose:
                    print(f"\n⏳ Gemini server busy. Retrying in {wait_time}s...")
                _time.sleep(wait_time)
                agent = create_research_agent()
            else:
                raise

    if not final_response.strip():
        raise RuntimeError("LLM API rate limit exceeded. Please try again in 30 seconds.")

    rec_match = re.search(r"RECOMMENDATION[\s:\*#_-]*\s*(BUY|HOLD|SELL)\b", final_response, re.IGNORECASE)
    if rec_match:
        recommendation = rec_match.group(1).upper()
    else:
        rec_match2 = re.search(r"recommendation\s+(?:is\s+)?\**\s*(BUY|HOLD|SELL)\b", final_response, re.IGNORECASE)
        recommendation = rec_match2.group(1).upper() if rec_match2 else "HOLD"

    conf_match = re.search(r"CONFIDENCE[\s:\*#_-]*\s*(HIGH|MEDIUM|LOW)\b", final_response, re.IGNORECASE)
    if conf_match:
        confidence = conf_match.group(1).upper()
    else:
        conf_match2 = re.search(r"confidence\s+(?:is\s+)?\**\s*(HIGH|MEDIUM|LOW)\b", final_response, re.IGNORECASE)
        confidence = conf_match2.group(1).upper() if conf_match2 else "MEDIUM"

    return {
        "ticker": ticker,
        "recommendation": recommendation,
        "confidence": confidence,
        "summary": final_response,
        "trace": structured_trace,
        "raw_steps": steps,
    }


def save_agent_research_log_db(
    db: Session,
    user_id: Optional[str],
    research_result: dict
) -> AgentResearchLogDB:
    """Persists research run and trace to database."""
    log_id = str(uuid.uuid4())
    log_entry = AgentResearchLogDB(
        id=log_id,
        user_id=user_id,
        ticker=research_result.get("ticker", "UNKNOWN").upper(),
        recommendation=research_result.get("recommendation", "HOLD"),
        confidence=research_result.get("confidence", "MEDIUM"),
        summary=research_result.get("summary", ""),
        trace_json=json.dumps(research_result.get("trace", []), default=str),
        timestamp=datetime.now(timezone.utc),
    )

    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
