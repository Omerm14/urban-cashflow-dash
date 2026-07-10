-- CASH-49: registerPhone() in server/routes/webhook.js used to read
-- integrations.config, mutate it in JS, then write the whole object back —
-- a classic read-modify-write race. Two concurrent webhook deliveries for
-- the same integration could silently drop one registration.
--
-- This function makes the whitelist add + cross-integration reassignment
-- atomic: both UPDATEs compute their new value from the row's own current
-- `config` inside the same statement, so Postgres's row-level locking
-- serializes concurrent callers instead of letting one clobber the other.
CREATE OR REPLACE FUNCTION register_whatsapp_phone(p_integration_id uuid, p_phone text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_id uuid;
BEGIN
  -- Remove the phone from any other connected WhatsApp integration that
  -- currently holds it (re-assignment case).
  UPDATE integrations
  SET config = jsonb_set(
    config,
    '{whitelisted_phones}',
    COALESCE(
      (SELECT jsonb_agg(elem)
       FROM jsonb_array_elements_text(COALESCE(config->'whitelisted_phones', '[]'::jsonb)) AS elem
       WHERE elem <> p_phone),
      '[]'::jsonb
    )
  )
  WHERE type = 'whatsapp'
    AND status = 'connected'
    AND id <> p_integration_id
    AND config @> jsonb_build_object('whitelisted_phones', jsonb_build_array(p_phone))
  RETURNING id INTO v_prev_id;

  -- Add the phone to the target integration's whitelist, deduped.
  UPDATE integrations
  SET config = jsonb_set(
    config,
    '{whitelisted_phones}',
    (
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        COALESCE(config->'whitelisted_phones', '[]'::jsonb) || to_jsonb(p_phone::text)
      ) AS elem
    )
  )
  WHERE id = p_integration_id;

  RETURN v_prev_id;
END;
$$;

-- Reversible: DROP FUNCTION IF EXISTS register_whatsapp_phone(uuid, text);
