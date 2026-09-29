-- Supabase PostgreSQL Table Initialization Script
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/uxnanbvwflhkrealwrrt/sql/new

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Portfolios Table
CREATE TABLE IF NOT EXISTS public.portfolios (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    cash DOUBLE PRECISION DEFAULT 100000.0
);

-- 3. Create Positions Table
CREATE TABLE IF NOT EXISTS public.positions (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    ticker VARCHAR NOT NULL,
    quantity INTEGER NOT NULL,
    average_price DOUBLE PRECISION NOT NULL,
    current_price DOUBLE PRECISION NOT NULL
);

-- 4. Create Trades Table
CREATE TABLE IF NOT EXISTS public.trades (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    ticker VARCHAR NOT NULL,
    action VARCHAR NOT NULL,
    quantity INTEGER NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pnl DOUBLE PRECISION,
    strategy VARCHAR DEFAULT 'MANUAL',
    reason VARCHAR
);

-- 5. Enable pgvector Extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 6. Create Agent Research Logs Table
CREATE TABLE IF NOT EXISTS public.agent_research_logs (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES public.users(id) ON DELETE CASCADE,
    ticker VARCHAR NOT NULL,
    recommendation VARCHAR NOT NULL,
    confidence VARCHAR DEFAULT 'MEDIUM',
    summary TEXT NOT NULL,
    trace_json TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_research_logs_ticker ON public.agent_research_logs(ticker);

-- 7. Create Trade Episodes Table (Quant Memory RAG)
CREATE TABLE IF NOT EXISTS public.trade_episodes (
    id VARCHAR PRIMARY KEY,
    ticker VARCHAR NOT NULL,
    entry_date VARCHAR NOT NULL,
    exit_date VARCHAR NOT NULL,
    action VARCHAR NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    exit_price DOUBLE PRECISION NOT NULL,
    quantity INTEGER NOT NULL,
    pnl DOUBLE PRECISION NOT NULL,
    pnl_pct DOUBLE PRECISION NOT NULL,
    exit_reason VARCHAR NOT NULL,
    sma_gap_pct DOUBLE PRECISION NOT NULL,
    rsi14 DOUBLE PRECISION NOT NULL,
    atr_pct DOUBLE PRECISION NOT NULL,
    market_regime VARCHAR NOT NULL,
    reflection_text TEXT NOT NULL,
    embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trade_episodes_ticker ON public.trade_episodes(ticker);
CREATE INDEX IF NOT EXISTS idx_trade_episodes_regime ON public.trade_episodes(market_regime);
CREATE INDEX IF NOT EXISTS idx_trade_episodes_embedding ON public.trade_episodes USING hnsw (embedding vector_cosine_ops);

