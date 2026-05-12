-- Batch update stock prices via RPC
CREATE OR REPLACE FUNCTION public.batch_update_stock_prices(
  updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT
      (elem->>'id')::uuid as stock_id,
      (elem->>'current_price')::numeric as price,
      (elem->>'price_updated_at')::timestamptz as price_updated_at,
      (elem->>'updated_at')::timestamptz as updated_at
    FROM jsonb_array_elements(updates) as elem
  LOOP
    UPDATE public.stocks
    SET
      current_price = rec.price,
      price_updated_at = rec.price_updated_at,
      updated_at = rec.updated_at
    WHERE id = rec.stock_id;
  END LOOP;
END;
$$;
