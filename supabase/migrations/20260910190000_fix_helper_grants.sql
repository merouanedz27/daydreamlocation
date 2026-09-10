-- =============================================================================
-- Correction : les helpers RLS doivent être exécutables par `authenticated`
--
-- SYMPTÔME : toutes les tables renvoyaient HTTP 403
--   {"code":"42501","message":"permission denied for function is_staff"}
-- pour TOUS les utilisateurs, propriétaire compris. L'application entière était
-- inutilisable.
--
-- CAUSE : la migration RLS révoquait `execute` sur `private.is_owner()` et
-- `private.is_staff()` pour `authenticated`, en suivant la consigne
-- « révoquer EXECUTE aux rôles qui ne doivent pas appeler ces fonctions
-- directement ».
--
-- Le raisonnement était faux : une policy RLS s'exécute avec les privilèges de
-- l'APPELANT. C'est donc `authenticated` lui-même qui invoque
-- `private.is_staff()` à chaque requête. Sans `execute`, la policy échoue au
-- lieu de refuser proprement — et elle échoue pour tout le monde.
--
-- POURQUOI CELA RESTE SÛR :
--   * le schéma `private` n'est pas exposé par PostgREST (seuls `public` et
--     `graphql_public` le sont), donc aucun appel RPC possible ;
--   * ces fonctions ne prennent aucun argument et répondent uniquement
--     « l'utilisateur courant est-il X ? ». Elles ne révèlent rien que
--     l'appelant ne sache déjà sur lui-même ;
--   * `anon` reste exclu : sans session, aucun accès.
--
-- Leçon retenue : vérifier qu'une policy AUTORISE bien les ayants droit, et pas
-- seulement qu'elle bloque les autres. Le test « RLS activée partout » passait
-- au vert alors que plus rien ne fonctionnait.
-- =============================================================================

grant usage on schema private to authenticated;

grant execute on function private.is_owner() to authenticated;
grant execute on function private.is_staff() to authenticated;

-- `anon` n'a toujours rien : pas de session, pas d'accès.
revoke all on schema private from anon, public;
