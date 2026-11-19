-- Twilio4-only send idempotency and rate-limit state.
-- This migration contains no recipient numbers, message bodies, sender numbers, or provider SIDs.
-- Do not apply this migration to either Summons database.

CREATE SCHEMA IF NOT EXISTS jg_messaging_private;
REVOKE ALL ON SCHEMA jg_messaging_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA jg_messaging_private TO service_role;

CREATE TABLE jg_messaging_private.send_attempts (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  template_id text NOT NULL CHECK (length(template_id) BETWEEN 1 AND 128),
  recipient_count smallint NOT NULL CHECK (recipient_count BETWEEN 1 AND 50),
  state text NOT NULL CHECK (state IN ('processing', 'accepted', 'partial', 'failed')),
  accepted_count smallint NOT NULL DEFAULT 0 CHECK (accepted_count BETWEEN 0 AND 50),
  failed_count smallint NOT NULL DEFAULT 0 CHECK (failed_count BETWEEN 0 AND 50),
  provider_statuses jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_statuses) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  PRIMARY KEY (actor_id, request_id),
  CHECK (
    (state = 'processing' AND finished_at IS NULL AND accepted_count = 0 AND failed_count = 0) OR
    (state = 'accepted' AND finished_at IS NOT NULL AND accepted_count = recipient_count AND failed_count = 0) OR
    (state = 'partial' AND finished_at IS NOT NULL AND accepted_count > 0 AND failed_count > 0 AND accepted_count + failed_count = recipient_count) OR
    (state = 'failed' AND finished_at IS NOT NULL AND accepted_count = 0 AND failed_count = recipient_count)
  )
);

ALTER TABLE jg_messaging_private.send_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE jg_messaging_private.send_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX send_attempts_actor_created_idx
  ON jg_messaging_private.send_attempts (actor_id, created_at DESC);
CREATE INDEX send_attempts_processing_actor_idx
  ON jg_messaging_private.send_attempts (actor_id)
  WHERE state = 'processing';

CREATE FUNCTION jg_messaging_private.claim_send_attempt(
  p_actor_id uuid,
  p_request_id uuid,
  p_template_id text,
  p_recipient_count integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing_state text;
  v_existing_accepted integer;
  v_existing_failed integer;
  v_existing_statuses jsonb;
  v_recent_count integer;
  v_processing_count integer;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_template_id IS NULL OR
     length(trim(p_template_id)) NOT BETWEEN 1 AND 128 OR
     p_recipient_count IS NULL OR
     p_recipient_count NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_send_claim' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));

  SELECT state, accepted_count, failed_count, provider_statuses
    INTO v_existing_state, v_existing_accepted, v_existing_failed, v_existing_statuses
  FROM jg_messaging_private.send_attempts
  WHERE actor_id = p_actor_id AND request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'status', v_existing_state,
      'accepted_count', v_existing_accepted,
      'failed_count', v_existing_failed,
      'provider_statuses', v_existing_statuses
    );
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM jg_messaging_private.send_attempts
  WHERE actor_id = p_actor_id AND created_at >= clock_timestamp() - interval '1 hour';
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'messaging_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_processing_count
  FROM jg_messaging_private.send_attempts
  WHERE actor_id = p_actor_id AND state = 'processing';
  IF v_processing_count >= 2 THEN
    RAISE EXCEPTION 'messaging_concurrency_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO jg_messaging_private.send_attempts (
    actor_id, request_id, template_id, recipient_count, state
  ) VALUES (p_actor_id, p_request_id, p_template_id, p_recipient_count, 'processing');

  RETURN jsonb_build_object('claimed', true, 'status', 'processing');
END;
$function$;

CREATE FUNCTION jg_messaging_private.finish_send_attempt(
  p_actor_id uuid,
  p_request_id uuid,
  p_accepted_count integer,
  p_failed_count integer,
  p_provider_statuses jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_recipient_count integer;
  v_status text;
  v_status_total integer;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR
     p_accepted_count IS NULL OR p_failed_count IS NULL OR
     p_accepted_count NOT BETWEEN 0 AND 50 OR p_failed_count NOT BETWEEN 0 AND 50 OR
     jsonb_typeof(p_provider_statuses) IS DISTINCT FROM 'object' OR
     length(p_provider_statuses::text) > 2048 THEN
    RAISE EXCEPTION 'invalid_send_outcome' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(p_provider_statuses) AS bucket(status, count_text)
    WHERE status !~ '^[A-Za-z0-9_-]{1,32}$'
       OR count_text !~ '^[0-9]{1,2}$'
       OR count_text::integer > 50
  ) THEN
    RAISE EXCEPTION 'invalid_provider_status_summary' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(count_text::integer), 0) INTO v_status_total
  FROM jsonb_each_text(p_provider_statuses) AS bucket(status, count_text);

  SELECT recipient_count INTO v_recipient_count
  FROM jg_messaging_private.send_attempts
  WHERE actor_id = p_actor_id AND request_id = p_request_id AND state = 'processing'
  FOR UPDATE;

  IF NOT FOUND OR p_accepted_count + p_failed_count <> v_recipient_count OR v_status_total <> v_recipient_count THEN
    RAISE EXCEPTION 'send_attempt_not_pending_or_incomplete' USING ERRCODE = 'P0001';
  END IF;

  v_status := CASE
    WHEN p_failed_count = 0 THEN 'accepted'
    WHEN p_accepted_count = 0 THEN 'failed'
    ELSE 'partial'
  END;

  UPDATE jg_messaging_private.send_attempts
  SET state = v_status,
      accepted_count = p_accepted_count,
      failed_count = p_failed_count,
      provider_statuses = p_provider_statuses,
      finished_at = clock_timestamp()
  WHERE actor_id = p_actor_id AND request_id = p_request_id AND state = 'processing';

  RETURN jsonb_build_object(
    'status', v_status,
    'accepted_count', p_accepted_count,
    'failed_count', p_failed_count
  );
END;
$function$;

CREATE FUNCTION jg_messaging_private.session_is_active(
  p_user_id uuid,
  p_session_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions
    WHERE user_id = p_user_id AND id = p_session_id
  );
$function$;

CREATE FUNCTION public.claim_jg_message_send(
  p_actor_id uuid,
  p_request_id uuid,
  p_template_id text,
  p_recipient_count integer
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jg_messaging_private.claim_send_attempt(p_actor_id, p_request_id, p_template_id, p_recipient_count);
$function$;

CREATE FUNCTION public.finish_jg_message_send(
  p_actor_id uuid,
  p_request_id uuid,
  p_accepted_count integer,
  p_failed_count integer,
  p_provider_statuses jsonb
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jg_messaging_private.finish_send_attempt(p_actor_id, p_request_id, p_accepted_count, p_failed_count, p_provider_statuses);
$function$;

CREATE FUNCTION public.is_jg_messaging_session_active(
  p_user_id uuid,
  p_session_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jg_messaging_private.session_is_active(p_user_id, p_session_id);
$function$;

REVOKE ALL ON FUNCTION jg_messaging_private.claim_send_attempt(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jg_messaging_private.finish_send_attempt(uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jg_messaging_private.session_is_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION jg_messaging_private.claim_send_attempt(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION jg_messaging_private.finish_send_attempt(uuid, uuid, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION jg_messaging_private.session_is_active(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_jg_message_send(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_jg_message_send(uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_jg_messaging_session_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jg_message_send(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_jg_message_send(uuid, uuid, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_jg_messaging_session_active(uuid, uuid) TO service_role;
