-- Phase 02: Minimal Admin Review UI
-- Adds rejection_reason to dividend_events for admin reject workflow.

alter table public.dividend_events
  add column if not exists rejection_reason text;
