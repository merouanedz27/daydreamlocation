-- =============================================================================
-- Libellés de COSTUME : les anciennes saisies ramenées à sa liste officielle.
--
-- La case costume ne propose plus que sa liste (`src/lib/item-catalog.ts`).
-- Les commandes déjà saisies gardaient leurs variantes tapées à la main
-- (« Invité noire », « Invite vert », « invite Bue Nuite Croise »…) : elles
-- prennent ici le libellé OFFICIEL.
--
-- Seules les correspondances SANS AMBIGUÏTÉ sont faites. Ne sont PAS touchés,
-- à corriger au besoin par « Modifier » sur la commande :
--   - les tuxedos sans lettre de Gelly : « A », « B », « Tuxedo A », « 3riss E »,
--     « 3riss (A) »… — on ne sait pas quel Gelly le client a pris ;
--   - les saisies composées : « 3riss B+ Barnous », « A + jabador vert »,
--     « Invite bleu nuit + Barnous »… — plusieurs pièces dans une case ;
--   - les pièces hors liste : « Jabador rouge sghir », « Blasser grenet 52 »,
--     « Blazer beige », « barnous noir twil »…
--
-- Ne touche QUE la case costume (1ʳᵉ ligne de la commande), que des lignes
-- hors stock (`unit_id` nul) : ni prix, ni dates, ni disponibilité ne bougent.
-- La taille écrite dans le libellé (« Invité vert 52 ») passe dans
-- `size_snapshot` seulement si celle-ci est vide.
-- =============================================================================

with mapping (old, official, size) as (
  values
    ('Invité noire',              'Invite Noir Simple',          null),
    ('Invite noir',               'Invite Noir Simple',          null),
    ('Invite vert',               'Invite Vert Croise',          null),
    ('Invt vert',                 'Invite Vert Croise',          null),
    ('Invité vert',               'Invite Vert Croise',          null),
    ('Invite vert croise',        'Invite Vert Croise',          null),
    ('Invité croisé vert',        'Invite Vert Croise',          null),
    ('Invité vert 52',            'Invite Vert Croise',          '52'),
    ('invite Bue Nuite Croise',   'Invite Blue Nuit Croise',     null),
    ('Invite bleu nuit croise',   'Invite Blue Nuit Croise',     null),
    ('Bleu nuit croisé',          'Invite Blue Nuit Croise',     null),
    ('Invite Blue croise',        'Invite Blue Nuit Croise',     null),
    ('Bleu croise',               'Invite Blue Nuit Croise',     null),
    ('Invité bleu arriere',       'Invite Blue Arriere',         null),
    ('Invité bleu arilleur',      'Invite Blue Arriere',         null),
    ('invite Blue Nuit arriere',  'Invite Blue Arriere',         null),
    ('Invite gris',               'Invite Gris',                 null),
    ('Invite beige',              'Invite Beige Simple',         null),
    ('Beige',                     'Invite Beige Simple',         null),
    ('Costume greuna',            'Invite Greuna',               null),
    ('Pantalon Invite Noir',      'Pantalon Invite Noir Simple', null),
    ('Pantalon invite noir 50',   'Pantalon Invite Noir Simple', '50')
),
costume_lines as (
  select id, model_name_snapshot
  from (
    select l.id, l.model_name_snapshot, l.unit_id, l.external_label,
      row_number() over (partition by l.order_id order by l.id) as pos
    from public.order_lines l
  ) ranked
  where pos = 1
    and unit_id is null
    and external_label is null
)
update public.order_lines l
set model_name_snapshot = m.official,
    size_snapshot = coalesce(nullif(btrim(l.size_snapshot), ''), m.size, l.size_snapshot)
from costume_lines c
join mapping m on lower(btrim(c.model_name_snapshot)) = lower(m.old)
where l.id = c.id;
