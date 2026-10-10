-- One-time source export for an existing deployment; not a runtime dependency.
-- Stop all application writers before running this with psql. Protect the output
-- as private ownership data. Timestamp conversion matches libSQL timestamp_ms.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
  'version', 1,
  'tables', json_build_object(
    'number_sessions', (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
      SELECT id::text, clerk_user_id, number, number_key, service, country, flag, network,
        round(extract(epoch FROM assigned_at) * 1000)::bigint AS assigned_at,
        round(extract(epoch FROM expires_at) * 1000)::bigint AS expires_at,
        round(extract(epoch FROM released_at) * 1000)::bigint AS released_at,
        end_reason, round(extract(epoch FROM created_at) * 1000)::bigint AS created_at
      FROM number_sessions
    ) r),
    'active_number_leases', (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
      SELECT number_key, session_id::text, clerk_user_id,
        round(extract(epoch FROM expires_at) * 1000)::bigint AS expires_at
      FROM active_number_leases
    ) r),
    'mailboxes', (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
      SELECT id::text, clerk_user_id, email, email_key, domain,
        round(extract(epoch FROM created_at) * 1000)::bigint AS created_at
      FROM mailboxes
    ) r),
    'mailbox_ownership', (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
      SELECT email_key, provider_email, mailbox_id::text, clerk_user_id,
        round(extract(epoch FROM created_at) * 1000)::bigint AS created_at
      FROM mailbox_ownership
    ) r),
    'app_rate_limits', (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
      SELECT bucket, round(extract(epoch FROM window_start) * 1000)::bigint AS window_start, request_count
      FROM app_rate_limits
    ) r)
  )
);
COMMIT;
