-- Fix function overload: remove the 2-argument variants left by Phase 06
-- so that the 3-argument Phase 05 variants are the only ones available.

drop function if exists public.approve_dividend_review_for_reviewer(uuid, uuid);
drop function if exists public.reject_dividend_review_for_reviewer(uuid, text, uuid);
