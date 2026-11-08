-- =============================================================================
-- RETOUCHES et rôle TAILLEUR.
--
--   node scripts/run-sql.mjs supabase/tests/retouches.sql
--
-- Vérifie :
--   * le tailleur ne lit RIEN directement (commandes, lignes, dépenses, stock,
--     retouches) ;
--   * il lit la liste via list_alterations() et marque via mark_altered() ;
--   * un second scan ne change rien (already_done) ;
--   * une modification de commande garde la retouche (même id = même étiquette),
--     la remet à faire si la note change, et la supprime si la case est décochée.
-- Se termine par un rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_tail uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
     u.email, 'x', now(), '{}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', '', now(), now()
  from (values (v_owner, 'rettest-owner@daydream.test'),
               (v_staff, 'rettest-staff@daydream.test'),
               (v_tail, 'rettest-tail@daydream.test')) as u(id, email);

  update public.profiles set role = 'owner', is_active = true, full_name = 'RET owner' where id = v_owner;
  update public.profiles set role = 'staff', is_active = true, full_name = 'RET staff' where id = v_staff;
  update public.profiles set role = 'tailleur', is_active = true, full_name = 'RET tailleur' where id = v_tail;

  insert into public.expenses (category, amount, description) values ('loyer', 5000, 'RET TEST');

  create temp table test_ids (owner_id uuid, staff_id uuid, tail_id uuid, order_id bigint, alt_id uuid)
    on commit drop;
  insert into test_ids values (v_owner, v_staff, v_tail, null, null);
end $$;

create or replace function pg_temp.run_as(p_user uuid, p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if p_sql ilike 'select%' then
    execute p_sql into v_count;
  else
    execute p_sql;
    get diagnostics v_count = row_count;
  end if;
  perform set_config('role', 'postgres', true);
  return v_count;
exception when insufficient_privilege then
  perform set_config('role', 'postgres', true);
  return 0;
when others then
  perform set_config('role', 'postgres', true);
  raise notice 'ERREUR: %', sqlerrm;
  return -1;
end $$;

-- Rend une valeur texte lue sous l'identité d'un utilisateur (NULL sur erreur).
create or replace function pg_temp.text_as(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute p_sql into v;
  perform set_config('role', 'postgres', true);
  return v;
exception when others then
  perform set_config('role', 'postgres', true);
  raise notice 'ERREUR: %', sqlerrm;
  return null;
end $$;

do $$
declare
  v_owner uuid; v_staff uuid; v_tail uuid;
  v_order bigint;
  v_alt uuid;
  v_alt2 uuid;
  v_text text;
  n integer;
  v_lines jsonb;
begin
  select owner_id, staff_id, tail_id into v_owner, v_staff, v_tail from test_ids;

  -- 1. L'employé crée une commande : une pièce avec retouche, une sans.
  v_lines := jsonb_build_array(
    jsonb_build_object('kind', 'named', 'name', 'Veste RET', 'size', '50',
                       'unitPrice', 0, 'alteration', jsonb_build_object('note', 'Manches -2 cm')),
    jsonb_build_object('kind', 'named', 'name', 'Chemise RET', 'size', '40', 'unitPrice', 0)
  );
  v_text := pg_temp.text_as(v_staff, format(
    'select public.create_order(%L, null, (current_date + 10)::date, null, null, 0, 0, 0, null, %L::jsonb)::text',
    'Client RET', v_lines));
  v_order := v_text::bigint;
  update test_ids set order_id = v_order;

  select count(*) into n from public.line_alterations where order_id = v_order;
  insert into test_results values ('01. create_order cree une retouche', '1', n::text, n = 1);

  select id into v_alt from public.line_alterations where order_id = v_order;
  update test_ids set alt_id = v_alt;

  -- 2. Le tailleur ne lit rien directement.
  n := pg_temp.run_as(v_tail, 'select count(*) from public.orders');
  insert into test_results values ('02. tailleur ne lit PAS les commandes', '0', n::text, n = 0);
  n := pg_temp.run_as(v_tail, 'select count(*) from public.order_lines');
  insert into test_results values ('03. tailleur ne lit PAS les lignes', '0', n::text, n = 0);
  n := pg_temp.run_as(v_tail, 'select count(*) from public.expenses');
  insert into test_results values ('04. tailleur ne lit PAS les depenses', '0', n::text, n = 0);
  n := pg_temp.run_as(v_tail, 'select count(*) from public.line_alterations');
  insert into test_results values ('05. tailleur ne lit PAS la table des retouches', '0', n::text, n = 0);
  n := pg_temp.run_as(v_tail, 'select count(*) from public.article_units');
  insert into test_results values ('06. tailleur ne lit PAS le stock', '0', n::text, n = 0);
  n := pg_temp.run_as(v_tail, format(
    'insert into public.expenses (category, amount, created_by) values (''retouche'', 100, %L)', v_tail));
  insert into test_results values ('07. tailleur ne saisit PAS de frais', '<= 0', n::text, n <= 0);

  -- 3. L'employé, lui, lit toujours.
  n := pg_temp.run_as(v_staff, 'select count(*) from public.orders');
  insert into test_results values ('08. employe lit toujours les commandes', '>= 1', n::text, n >= 1);

  -- 4. Le tailleur lit la liste par la fonction.
  n := pg_temp.run_as(v_tail, format(
    'select count(*) from public.list_alterations(''a_faire'') where order_id = %s', v_order));
  insert into test_results values ('09. tailleur lit la liste a faire', '1', n::text, n = 1);

  v_text := pg_temp.text_as(v_tail, format(
    'select customer_name || ''|'' || note || ''|'' || size from public.list_alterations(null, %L)', v_alt));
  insert into test_results values ('10. une retouche par id', 'Client RET|Manches -2 cm|50',
    coalesce(v_text, 'NULL'), v_text = 'Client RET|Manches -2 cm|50');

  -- 5. Il la marque taillée, puis rescanne.
  v_text := pg_temp.text_as(v_tail, format(
    'select already_done::text from public.mark_altered(%L)', v_alt));
  insert into test_results values ('11. premier scan', 'false', coalesce(v_text, 'NULL'), v_text = 'false');

  select status || '|' || (done_by = v_tail)::text into v_text from public.line_alterations where id = v_alt;
  insert into test_results values ('12. statut taillee par le tailleur', 'taillee|true', v_text, v_text = 'taillee|true');

  v_text := pg_temp.text_as(v_tail, format(
    'select already_done::text from public.mark_altered(%L)', v_alt));
  insert into test_results values ('13. second scan : deja faite', 'true', coalesce(v_text, 'NULL'), v_text = 'true');

  n := pg_temp.run_as(v_tail, format(
    'select count(*) from public.list_alterations(''a_faire'') where order_id = %s', v_order));
  insert into test_results values ('14. plus dans la liste a faire', '0', n::text, n = 0);

  -- 5b. Annuler un scan : le tailleur défait le SIEN, pas celui du magasin.
  v_text := pg_temp.text_as(v_tail, format(
    'select done_by_me::text from public.list_alterations(p_id => %L)', v_alt));
  insert into test_results values ('14a. done_by_me pour le tailleur', 'true', coalesce(v_text, 'NULL'), v_text = 'true');

  v_text := pg_temp.text_as(v_tail, format(
    'select (public.undo_altered(%L) = %s)::text', v_alt, v_order));
  insert into test_results values ('14b. tailleur annule son scan', 'true', coalesce(v_text, 'NULL'), v_text = 'true');

  select status || '|' || (done_at is null)::text || '|' || (done_by is null)::text into v_text
  from public.line_alterations where id = v_alt;
  insert into test_results values ('14c. repart a faire', 'a_faire|true|true', v_text, v_text = 'a_faire|true|true');

  -- Le magasin la marque : le tailleur ne peut plus l'annuler.
  perform pg_temp.text_as(v_staff, format(
    'select already_done::text from public.mark_altered(%L)', v_alt));
  v_text := pg_temp.text_as(v_tail, format(
    'select done_by_me::text from public.list_alterations(p_id => %L)', v_alt));
  insert into test_results values ('14d. done_by_me faux (scan du magasin)', 'false', coalesce(v_text, 'NULL'), v_text = 'false');

  v_text := pg_temp.text_as(v_tail, format('select public.undo_altered(%L)::text', v_alt));
  insert into test_results values ('14e. tailleur refuse sur scan du magasin', 'NULL', coalesce(v_text, 'NULL'), v_text is null);
  select status into v_text from public.line_alterations where id = v_alt;
  insert into test_results values ('14f. reste taillee', 'taillee', v_text, v_text = 'taillee');

  -- Le magasin annule n'importe quel scan, puis le tailleur remarque (suite du test).
  perform pg_temp.text_as(v_staff, format('select public.undo_altered(%L)::text', v_alt));
  select status into v_text from public.line_alterations where id = v_alt;
  insert into test_results values ('14g. magasin annule', 'a_faire', v_text, v_text = 'a_faire');
  perform pg_temp.text_as(v_tail, format(
    'select already_done::text from public.mark_altered(%L)', v_alt));

  -- 6. Un compte désactivé ne passe plus.
  update public.profiles set is_active = false where id = v_tail;
  v_text := pg_temp.text_as(v_tail, format(
    'select already_done::text from public.mark_altered(%L)', v_alt));
  insert into test_results values ('15. tailleur desactive refuse', 'NULL', coalesce(v_text, 'NULL'), v_text is null);
  update public.profiles set is_active = true where id = v_tail;

  -- 7. Modification de la commande, MÊME note : la retouche garde son id et son statut.
  v_lines := jsonb_build_array(
    jsonb_build_object('kind', 'named', 'name', 'Veste RET', 'size', '50', 'unitPrice', 0,
                       'alteration', jsonb_build_object('id', v_alt, 'note', 'Manches -2 cm')),
    jsonb_build_object('kind', 'named', 'name', 'Chemise RET', 'size', '40', 'unitPrice', 0)
  );
  n := pg_temp.run_as(v_staff, format(
    'select public.update_order(%s, %L, null, (current_date + 10)::date, null, null, 0, 0, null, false, false, %L::jsonb)::int',
    v_order, 'Client RET', v_lines));
  select string_agg(status, ',') into v_text from public.line_alterations where id = v_alt and order_line_id is not null;
  insert into test_results values ('16. modif meme note : garde id et statut', 'taillee', coalesce(v_text, 'NULL'), v_text = 'taillee');

  -- 8. Note changée : à refaire.
  v_lines := jsonb_set(v_lines, '{0,alteration,note}', '"Manches -3 cm"');
  n := pg_temp.run_as(v_staff, format(
    'select public.update_order(%s, %L, null, (current_date + 10)::date, null, null, 0, 0, null, false, false, %L::jsonb)::int',
    v_order, 'Client RET', v_lines));
  select status || '|' || coalesce(done_at::text, 'null') into v_text from public.line_alterations where id = v_alt;
  insert into test_results values ('17. note changee : a refaire', 'a_faire|null', coalesce(v_text, 'NULL'), v_text = 'a_faire|null');

  -- 9. Une retouche ajoutée sur la chemise, la veste décochée.
  v_lines := jsonb_build_array(
    jsonb_build_object('kind', 'named', 'name', 'Veste RET', 'size', '50', 'unitPrice', 0),
    jsonb_build_object('kind', 'named', 'name', 'Chemise RET', 'size', '40', 'unitPrice', 0,
                       'alteration', jsonb_build_object('note', 'Col'))
  );
  n := pg_temp.run_as(v_staff, format(
    'select public.update_order(%s, %L, null, (current_date + 10)::date, null, null, 0, 0, null, false, false, %L::jsonb)::int',
    v_order, 'Client RET', v_lines));
  select count(*) into n from public.line_alterations where id = v_alt;
  insert into test_results values ('18. case decochee : retouche supprimee', '0', n::text, n = 0);
  select l.model_name_snapshot into v_text
  from public.line_alterations a join public.order_lines l on l.id = a.order_line_id
  where a.order_id = v_order;
  insert into test_results values ('19. nouvelle retouche sur la bonne piece', 'Chemise RET',
    coalesce(v_text, 'NULL'), v_text = 'Chemise RET');

  -- 10. Un id d'une autre commande n'est pas emprunté.
  select id into v_alt2 from public.line_alterations where order_id = v_order;
  v_lines := jsonb_build_array(
    jsonb_build_object('kind', 'named', 'name', 'Autre', 'unitPrice', 0,
                       'alteration', jsonb_build_object('id', v_alt2, 'note', 'Vol'))
  );
  v_text := pg_temp.text_as(v_staff, format(
    'select public.create_order(%L, null, (current_date + 12)::date, null, null, 0, 0, 0, null, %L::jsonb)::text',
    'Client RET 2', v_lines));
  select note into v_text from public.line_alterations where id = v_alt2;
  insert into test_results values ('20. id d''une autre commande ignore', 'Col', coalesce(v_text, 'NULL'), v_text = 'Col');

  -- 11. Un anonyme n'appelle rien.
  begin
    perform set_config('role', 'anon', true);
    perform public.list_alterations('a_faire');
    perform set_config('role', 'postgres', true);
    insert into test_results values ('21. anonyme refuse', 'refus', 'accepte', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into test_results values ('21. anonyme refuse', 'refus', 'refus', true);
  end;
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) || ' tests reussis' as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
