-- =============================================================================
-- Notifications : isolation RLS et abonnements par utilisateur.
--
--   node scripts/run-sql.mjs supabase/tests/notifications.sql
--
-- Le test se termine par rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_moderator uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
    email, 'x', now(), '{}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '', now(), now()
  from (values
    (v_owner, 'notifications-owner@daydream.test'),
    (v_staff, 'notifications-staff@daydream.test'),
    (v_moderator, 'notifications-moderator@daydream.test')
  ) as users(id, email);

  update public.profiles set role = 'owner', is_active = true where id = v_owner;
  update public.profiles set role = 'staff', is_active = true where id = v_staff;
  update public.profiles set role = 'moderator', is_active = true where id = v_moderator;

  create temp table test_ids (owner_id uuid, staff_id uuid, moderator_id uuid) on commit drop;
  insert into test_ids values (v_owner, v_staff, v_moderator);

  insert into public.notifications (
    recipient_id, kind, title_key, body_key, dedupe_key
  ) values
    (v_owner, 'order_created', 'notifications.orderCreatedTitle', 'notifications.orderCreatedBody', 'test-owner'),
    (v_staff, 'order_created', 'notifications.orderCreatedTitle', 'notifications.orderCreatedBody', 'test-staff'),
    (v_moderator, 'order_created', 'notifications.orderCreatedTitle', 'notifications.orderCreatedBody', 'test-moderator');
end $$;

create or replace function pg_temp.count_as(p_user uuid)
returns integer
language plpgsql
as $$
declare v_count integer;
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_count from public.notifications;
  perform set_config('role', 'postgres', true);
  return v_count;
end $$;

do $$
declare
  v_owner uuid;
  v_staff uuid;
  v_moderator uuid;
  v_notification bigint;
  v_count integer;
begin
  select owner_id, staff_id, moderator_id into v_owner, v_staff, v_moderator from test_ids;
  select id into v_notification from public.notifications where recipient_id = v_owner;

  v_count := pg_temp.count_as(v_owner);
  insert into test_results values ('owner voit sa notification', '1', v_count::text, v_count = 1);

  v_count := pg_temp.count_as(v_staff);
  insert into test_results values ('staff voit sa notification', '1', v_count::text, v_count = 1);

  v_count := pg_temp.count_as(v_moderator);
  insert into test_results values ('moderator voit sa notification', '1', v_count::text, v_count = 1);

  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_staff::text, 'role', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);
  update public.notifications set read_at = now() where id = v_notification;
  get diagnostics v_count = row_count;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne marque pas celle du owner', '0', v_count::text, v_count = 0);
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;