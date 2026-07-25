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
