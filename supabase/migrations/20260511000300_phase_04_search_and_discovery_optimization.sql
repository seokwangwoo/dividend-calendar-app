-- Phase 04: Search and Discovery Optimization
-- Add search indexes for fast prefix matching on 4,000+ stocks

-- 1. Enable pg_trgm extension for GIN indexes
create extension if not exists pg_trgm;

-- 2. GIN index on stocks(name) for fast prefix matching (ilike 'keyword%')
create index if not exists idx_stocks_name_gin on public.stocks using gin (name gin_trgm_ops);

-- 3. B-tree index on stocks(ticker) for prefix search
create index if not exists idx_stocks_ticker_prefix on public.stocks(ticker text_pattern_ops);

-- 4. Composite index for search queries that filter by support_status and order by ticker
create index if not exists idx_stocks_search on public.stocks(support_status, ticker);
