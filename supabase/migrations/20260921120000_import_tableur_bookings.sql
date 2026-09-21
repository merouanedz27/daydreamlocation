-- =============================================================================
-- Reprise du tableur — feuille « DD V2 - Bookings »
--
-- 110 commandes réelles (26/08/2026 → 01/10/2026), leurs 295 pièces, et les
-- 41 lignes de la colonne « Les frais (-) » converties en dépenses rattachées
-- à leur commande.
--
-- LES VÊTEMENTS SONT DES LIGNES DE COMMANDE, PAS UNE NOTE
--
-- Chaque colonne de vêtement remplie devient une ligne : le costume, la
-- chemise, les chaussures. C'est là que l'équipe les cherche — dans les pièces
-- de la commande, pas au fond d'un bloc de texte qui ne se filtre pas et ne
-- s'imprime pas en tableau.
--
-- Ces lignes ne portent PAS de `unit_id`. Le tableur nomme les vêtements en
-- texte libre — « Tuxedo A avec Gelly A », « 3riss E », « Invite Noir Simple »
-- — et le même libellé recouvre plusieurs vêtements réels, en plusieurs
-- tailles. Fabriquer une pièce de stock par libellé inventerait un inventaire
-- qui n'existe pas ; pire, ces fausses pièces bloqueraient des dates et
-- feraient refuser de vraies réservations à venir, puisque c'est `unit_id` qui
-- alimente la contrainte d'exclusion.
--
-- D'où un TROISIÈME type de ligne, à côté de la pièce du stock et de la pièce
-- sous-louée : une ligne qui NOMME un vêtement sans le rattacher au stock.
-- `model_name_snapshot` porte le libellé du tableur, `size_snapshot` les
-- tailles, `line_note` la colonne « Tailleur » (« TK-525 (14CM) »). Le jour où
-- le stock sera saisi, ces lignes pourront recevoir leur `unit_id` : l'écran
-- de saisie, lui, continue de n'accepter que les deux cas d'origine.
--
-- LE PRIX EST PORTÉ PAR LA PREMIÈRE PIÈCE
--
-- Le tableur ne donne qu'un prix pour toute la tenue (colonne PRIX) : il va
-- sur la première pièce, les autres à zéro. La somme des lignes vaut donc bien
-- le prix de la commande — ce que le trigger `orders_recompute_totals`
-- recalcule de toute façon à chaque ligne insérée. Conséquence visible : une
-- chemise s'affiche à « 0 DA » sur la fiche. C'est ce que dit le tableur ; il
-- n'y a pas de prix par pièce à inventer.
--
-- CE QUI EST DÉDUIT
--
-- * `pickup_date` / `return_due_date` : laissées nulles, donc calculées par
--   `orders_default_window` (J−1 / J+1) — la règle du produit, pas une copie.
-- * `status` : déduit des cases « Allez Valide » / « Retour Valide » par la
--   même règle que `private.order_status_from_flags`. Les deux lignes portant
--   « annuler ❌❌❌ » deviennent `annulee`.
-- * Les dates du tableur mélangent deux formats : J/M/AAAA pour les lignes 3 à
--   95, M/J/AAAA à partir de la ligne 96 (« 9/17/2026 » ne peut être qu'un
--   mois 9). Chaque bloc est lu dans son propre format.
--
-- CE QUI N'EST PAS DEVINÉ — à reprendre à la main
--
-- * `caution_amount` reste à zéro. Deux lignes portent « Consille » dans leur
--   texte (Sifou : 10000 Da, Madjid Rezga : 6000 Da). C'est probablement une
--   consigne, donc une caution — mais une caution inventée fausserait les
--   comptes. Le libellé est conservé sur la pièce.
-- * `actual_return_date` reste nulle sur les commandes retournées : le tableur
--   ne note pas la date du retour réel.
-- * Ligne 25 (zakaria alaa dine) et ligne 35 (Kaddar mohamed) : la colonne
--   REST du tableur contredit PRIX − VERS. VERS et PRIX sont importés tels
--   quels ; `balance` étant une colonne générée, c'est elle qui tranche.
--
-- REJOUABLE, ET RATTRAPE UNE PREMIÈRE VERSION
--
-- Les deux tables `private.import_*` sont le journal de la reprise : la ligne
-- du tableur en face de la commande et des lignes créées. Rejouer ce fichier
-- ne crée donc rien en double. Il rattrape aussi la première version de cette
-- reprise, qui rangeait les vêtements dans `orders.notes` : les commandes déjà
-- créées reçoivent leurs pièces et voient leurs notes réécrites.
--
-- Pour tout annuler :
--   delete from public.orders
--    where id in (select order_id from private.import_bookings);
--   update private.import_bookings set order_id = null, imported_at = null;
--   update private.import_booking_lines set line_id = null;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Une ligne doit DÉSIGNER quelque chose — trois façons, désormais.
--
-- La règle d'origine (pièce du stock OU pièce externe) ne connaissait pas le
-- vêtement nommé sans stock. `create_order` continue, lui, de n'accepter que
-- les deux cas d'origine : c'est la SAISIE qui reste stricte, pas la table.
-- -----------------------------------------------------------------------------
alter table public.order_lines
  drop constraint if exists order_lines_unit_or_external;

alter table public.order_lines
  drop constraint if exists order_lines_designates_something;

alter table public.order_lines
  add constraint order_lines_designates_something check (
    unit_id is not null
    or external_label is not null
    or model_name_snapshot is not null
  );

-- -----------------------------------------------------------------------------
-- 2. Le journal de la reprise.
-- -----------------------------------------------------------------------------
create table if not exists private.import_bookings (
  row_no integer primary key,
  customer_name text not null,
  customer_phone text,
  event_date date not null,
  picked_up boolean not null,
  returned boolean not null,
  status text not null,
  total_price numeric(12, 2) not null,
  amount_paid numeric(12, 2) not null,
  notes text,
  fee_amount numeric(12, 2),
  fee_category text,
  fee_label text,
  -- Renseigné = cette ligne du tableur est déjà entrée. C'est ce qui rend la
  -- reprise rejouable sans doublon.
  order_id bigint references public.orders (id) on delete set null,
  imported_at timestamptz
);

create table if not exists private.import_booking_lines (
  row_no integer not null references private.import_bookings (row_no) on delete cascade,
  -- « piece_no » et non « position » : ce dernier est un mot réservé SQL.
  piece_no integer not null,
  model_name text not null,
  size_label text,
  line_note text,
  unit_price numeric(12, 2) not null,
  line_id bigint references public.order_lines (id) on delete set null,
  primary key (row_no, piece_no)
);

comment on table private.import_bookings is
  'Journal de la reprise du tableur « DD V2 - Bookings » : une ligne de la '
  'feuille en face de la commande créée. Dans `private`, donc jamais exposée '
  'par l''API.';

comment on table private.import_booking_lines is
  'Les vêtements d''une ligne du tableur, un par colonne remplie, en face de '
  'la ligne de commande créée.';

-- -----------------------------------------------------------------------------
-- 3. Les lignes du tableur, telles quelles.
--
-- `do update` et non `do nothing` : si la reprise a déjà tourné dans sa
-- première version, ses valeurs sont RAFRAÎCHIES ici — les notes surtout, qui
-- ne portent plus les vêtements — sans toucher au `order_id` déjà acquis.
-- -----------------------------------------------------------------------------
insert into private.import_bookings (
  row_no, customer_name, customer_phone, event_date, picked_up, returned,
  status, total_price, amount_paid, notes, fee_amount, fee_category, fee_label
) values
  (3, 'Aymen', null, '2026-08-26', true, true, 'retournee', 8000, 8000, null, 2000, 'autre', '-2000 Da (Wifi)'),
  (4, 'Hafid', '0776977709', '2026-08-26', true, true, 'retournee', 7000, 7000, null, 1000, 'retouche', '-1000 Da (tailleur)'),
  (5, 'Zohir', null, '2026-08-26', true, true, 'retournee', 8000, 8000, null, 500, 'nettoyage', '-500 Da (pressing)'),
  (6, 'Youcef', null, '2026-08-30', true, true, 'retournee', 4000, 4000, null, null, null, null),
  (7, 'Touati', '0781383134', '2026-09-12', true, true, 'retournee', 10000, 10000, null, 1250, 'retouche', '-1250 Da (Tailleur)'),
  (8, 'Khaled Cheurgia', '0672350174', '2026-09-01', true, true, 'retournee', 8000, 8000, null, 1000, 'retouche', '-1000 Da Tailleur'),
  (9, 'djillali Abass', '0668494967', '2026-09-01', true, true, 'retournee', 8000, 8000, null, 1050, 'nettoyage', '-1050 (Pressing)'),
  (10, 'Abdelah Abass', '0668494967', '2026-09-01', true, true, 'retournee', 8000, 8000, null, 2250, 'retouche', '-2250 Da (Tailleur)'),
  (11, 'Hidra', '0657274420', '2026-09-01', true, true, 'retournee', 8000, 8000, null, 2000, 'autre', '-2000 Da (Med Zwawi)'),
  (12, 'Bouksara ghani', '33748532326', '2026-09-02', true, true, 'retournee', 8000, 8000, null, 2000, 'retouche', '-2000 Da (Tailleur)'),
  (13, 'Zaki photograf', null, '2026-09-03', true, true, 'retournee', 0, 0, null, 155000, 'achat_stock', '-155000 Da (Costumat)'),
  (14, 'Sidahmed fotograf', null, '2026-09-03', true, true, 'retournee', 0, 0, null, 1200, 'autre', '-1200 Da ftour'),
  (15, 'Bouzid Nacer', '0696191256', '2026-09-03', true, true, 'retournee', 9000, 9000, null, 23000, 'autre', '-23000 Da'),
  (16, 'Sofiane', '0666711131', '2026-09-03', true, true, 'retournee', 15000, 15000, null, 1000, 'retouche', '-1000 (tailleur + livraison)'),
  (17, 'Mustafa hadri', null, '2026-09-03', true, true, 'retournee', 6000, 6000, null, 900, 'nettoyage', '-900( pressing)'),
  (18, 'Kada', '0542512201', '2026-09-03', true, true, 'retournee', 8500, 8500, null, 1700, 'transport', '- 1700 ( ftour + livraison)'),
  (19, 'Dahmane', '0665431253', '2026-09-03', true, true, 'retournee', 8500, 8500, null, 500, 'autre', '- 500 (gravaz)'),
  (20, 'ABDOU', '0676457989', '2026-09-04', true, true, 'retournee', 14000, 14000, null, 150, 'nettoyage', '-150 pressing'),
  (21, 'Sidahmed chaala', '0794459400', '2026-09-04', true, true, 'retournee', 13000, 13000, null, 2000, 'autre', '-2000 Da (3cha)'),
  (22, 'Abdenour', '0781068115', '2026-09-04', true, true, 'retournee', 6500, 6500, null, 3000, 'autre', '-3000 (Ouss)'),
  (23, 'Mourad', '0564774032', '2026-09-07', true, true, 'retournee', 9000, 9000, null, 30000, 'autre', '-30000 DA (Med Zwawi)'),
  (24, 'Balash Abdelkader', '0555967473', '2026-09-09', true, true, 'retournee', 8000, 8000, 'Versement (tableur) : 8000+{20000}', 30000, 'achat_stock', '-30000 Da (Chemises)'),
  (25, 'zakaria alaa dine', '0553074218', '2026-09-09', true, true, 'retournee', 4000, 4000, null, 3000, 'retouche', '- 3000 (tailleur 12 pantalon)'),
  (26, 'Mohamed chorfa', '0771575890', '2026-09-09', true, true, 'retournee', 11000, 11000, null, 2500, 'achat_stock', '-2500 ( 10 housses )'),
  (27, 'Belasla Zoo', '0662944897', '2026-09-10', true, true, 'retournee', 9000, 9000, null, 1500, 'autre', '-1500 Da'),
  (28, 'Mokhtar', null, '2026-09-10', true, true, 'retournee', 12000, 12000, null, 500, 'transport', '-500 ( livreur)'),
  (29, 'Moujab', '0698445484', '2026-09-10', true, true, 'retournee', 10000, 10000, null, 900, 'nettoyage', '- 900 (6 chemis pressing)'),
  (30, 'Oussama mokhtit', null, '2026-09-10', true, true, 'retournee', 4000, 4000, null, 250, 'retouche', '-250(livreur tailleur)'),
  (31, 'zoubir', null, '2026-09-10', true, true, 'retournee', 9000, 9000, null, 500, 'transport', '-500 ( livraison jabador)'),
  (32, 'yacine livreur (sahab zoubir )', null, '2026-09-10', false, false, 'annulee', 0, 0, null, 250, 'autre', '- 200 ( ftour) -50'),
  (33, 'Belasla zoo', '0662944897', '2026-09-10', true, true, 'retournee', 9000, 9000, null, 500, 'transport', '-500 Da (livreur)'),
  (34, 'Reda boukhidech', '0553822866', '2026-09-10', true, true, 'retournee', 8000, 8000, null, 700, 'autre', '-700 Da (Ftour)'),
  (35, 'Kaddar mohamed', '0779273677', '2026-09-11', true, true, 'retournee', 10000, 0, null, 1500, 'nettoyage', '-1500 Da (nettoyage)'),
  (36, 'Bozar smail', '0775726532', '2026-09-11', false, false, 'annulee', 7000, 0, null, 16400, 'achat_stock', '-16400 Da (chausurres)'),
  (37, 'abdelhakim Saber', '0771457861', '2026-09-11', true, true, 'retournee', 14000, 14000, null, 600, 'autre', '-600 ( corba )'),
  (38, 'Nasserdine Hama', '0797506343', '2026-09-11', true, true, 'retournee', 7000, 7000, null, 650, 'nettoyage', '-650 ( pressing )'),
  (39, 'Kallal Houcine', '0664389062', '2026-09-11', true, true, 'retournee', 13000, 13000, null, 500, 'autre', '-500 Da'),
  (40, 'Kallal karim', '0673036511', '2026-09-11', true, true, 'retournee', 10000, 10000, null, 200, 'transport', '-200 (livraison)'),
  (41, 'Guendouz Oussama', '0782872707', '2026-09-11', true, true, 'retournee', 1000, 1000, null, 100000, 'achat_stock', '-100000 Da (Jabador)'),
  (42, 'Benchouka Touati', '0666431717', '2026-09-12', true, true, 'retournee', 8000, 8000, null, 9000, 'achat_stock', '-9000 Da (Quipado)'),
  (43, 'Benhalima hamou', '0660712010', '2026-09-12', true, true, 'retournee', 8000, 8000, null, 26500, 'achat_stock', '-26500 Da (2 Serie Chemises)'),
  (44, 'Rooaghia Laid', '0557292561', '2026-09-12', true, true, 'retournee', 10000, 10000, null, 2450, 'nettoyage', '- 2450 DA ( pressing)'),
  (45, 'Mohamed chorfi', '0664761586', '2026-09-13', true, true, 'retournee', 15000, 5000, null, null, null, null),
  (46, 'Sifou', '0771548078', '2026-09-13', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (47, 'Hichem belamara', '0796287861', '2026-09-13', true, true, 'retournee', 10000, 10000, null, null, null, null),
  (48, 'Abdellah', null, '2026-09-13', true, true, 'retournee', 7000, 7000, null, null, null, null),
  (49, 'Benferiha houssam', '0556825197', '2026-09-14', true, true, 'retournee', 10000, 0, null, null, null, null),
  (50, 'Benfriha jeepa krimo', null, '2026-09-14', true, true, 'retournee', 10000, 0, null, null, null, null),
  (51, 'Benfriha billal', null, '2026-09-14', true, true, 'retournee', 10000, 0, null, null, null, null),
  (52, 'Aziz photograf', null, '2026-09-14', true, true, 'retournee', 4000, 4000, null, null, null, null),
  (54, 'Benssalah mohamed', '0771232572', '2026-09-15', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (55, 'Hadou omar', '0550460473', '2026-09-15', true, true, 'retournee', 10000, 10000, null, null, null, null),
  (56, 'Bensalah faycal', '0772025829', '2026-09-15', true, true, 'retournee', 1000, 1000, null, null, null, null),
  (57, 'Madjid Rezga (6000 Da Consille)', '213699457870', '2026-09-16', false, false, 'reservee', 5000, 1000, null, null, null, null),
  (58, 'BELHadj yassin', '0796838253', '2026-09-16', true, true, 'retournee', 5000, 5000, null, null, null, null),
  (59, 'Belmokhtar Islam', '0795354910', '2026-09-16', true, true, 'retournee', 7500, 7500, null, null, null, null),
  (60, 'Miloud Djoumi', '0782193569', '2026-09-16', true, true, 'retournee', 4500, 4500, null, null, null, null),
  (62, 'Aymen khelloul', '0697558953', '2026-09-17', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (63, 'Mohamed khelloul', '0670612625', '2026-09-17', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (64, 'Bouyagoub Ahmed', '0671274074', '2026-09-17', true, true, 'retournee', 14000, 14000, null, null, null, null),
  (65, 'Khalloul ayoub', '0697920211', '2026-09-17', true, true, 'retournee', 9000, 9000, null, null, null, null),
  (66, 'Ben kaybich mansour', '0557552446', '2026-09-17', true, true, 'retournee', 13000, 13000, null, null, null, null),
  (67, 'Himour fethi', '0791847674', '2026-09-17', true, true, 'retournee', 9000, 9000, null, null, null, null),
  (68, 'mohamed hamani', '0696248200', '2026-09-18', true, false, 'en_cours', 12000, 10000, null, null, null, null),
  (69, 'Mokhtar baghdadi', '0776749300', '2026-09-18', true, false, 'en_cours', 12000, 3000, null, null, null, null),
  (70, 'Adel mansour', '0660961199', '2026-09-18', true, true, 'retournee', 15000, 5000, 'Frais : Jabador rouge + bligha 43 blanc', null, null, null),
  (71, 'Fethi messali', '0670032555', '2026-09-18', true, false, 'en_cours', 3500, 2000, null, null, null, null),
  (72, 'Thari mehdi', '0660620777', '2026-09-18', true, false, 'en_cours', 15000, 15000, null, null, null, null),
  (73, 'Fiyo tayeb', '0795649717', '2026-09-18', true, false, 'en_cours', 11000, 11000, null, null, null, null),
  (74, 'Kamel belasgae', '0673679734', '2026-09-18', false, false, 'reservee', 15000, 15000, null, null, null, null),
  (75, 'Chahed hadj', '0671113379', '2026-09-18', true, true, 'retournee', 11500, 11500, null, null, null, null),
  (76, 'benkesmia bilal', '213676554717', '2026-09-18', true, false, 'en_cours', 12000, 12000, null, null, null, null),
  (77, 'Adel Larid', '0550942532', '2026-09-19', true, false, 'en_cours', 7000, 7000, null, null, null, null),
  (78, 'Darrar messabih', '0555936933', '2026-09-19', true, false, 'en_cours', 5000, 5000, null, null, null, null),
  (79, 'bekouche aymen', '213658146862', '2026-09-19', true, false, 'en_cours', 9000, 9000, null, null, null, null),
  (80, 'ammara alaa dine', null, '2026-09-20', false, false, 'reservee', 5000, 5000, null, null, null, null),
  (81, 'Adel larid', '0550942532', '2026-09-21', false, false, 'reservee', 10000, 1000, null, null, null, null),
  (82, 'Boubou makhlouf', '0770610693', '2026-09-23', false, false, 'reservee', 10000, 4000, null, null, null, null),
  (83, 'Cherife abdeaziz', '0697279831', '2026-09-23', false, false, 'reservee', 10000, 10000, null, null, null, null),
  (84, 'amar bentouta', '0560833147-0771002355', '2026-09-23', false, false, 'reservee', 12000, 4000, null, null, null, null),
  (85, 'Khouassa charef', '0549957544', '2026-09-24', false, false, 'reservee', 7000, 2000, null, null, null, null),
  (86, 'Achir abdelkader', '0672342118', '2026-09-24', false, false, 'reservee', 8000, 8000, null, null, null, null),
  (87, 'Achir sidahmed', '0795328656', '2026-09-24', false, false, 'reservee', 9000, 9000, null, null, null, null),
  (88, 'Chraitia djamal', '0664601660', '2026-09-25', false, false, 'reservee', 17000, 5000, null, null, null, null),
  (89, 'Fertoul mohamed', null, '2026-09-25', false, false, 'reservee', 4000, 2000, null, null, null, null),
  (90, 'Bourahla daoud', '0779539206', '2026-09-25', false, false, 'reservee', 10000, 8000, null, null, null, null),
  (91, 'Bourahla mohamed', '0793921037', '2026-09-25', false, false, 'reservee', 9000, 2000, null, null, null, null),
  (92, 'Jeddi mohamed', '0792087456', '2026-09-26', false, false, 'reservee', 15000, 3000, null, null, null, null),
  (93, 'Ahmed chorfi', '0662954152', '2026-09-25', false, false, 'reservee', 8000, 3000, null, null, null, null),
  (94, 'Madjid si ali', '0659730085', '2026-09-26', false, false, 'reservee', 9000, 3000, null, null, null, null),
  (95, 'ishak zaoui', '0554937419', '2026-09-27', false, false, 'reservee', 8000, 2000, null, null, null, null),
  (96, 'Boubaker ganona', '0776519154', '2026-10-01', false, false, 'reservee', 4000, 2000, null, null, null, null),
  (97, 'Mostefai Billal', null, '2026-09-17', true, true, 'retournee', 12000, 0, null, null, null, null),
  (98, 'Makou rami', '0657248302', '2026-09-17', true, true, 'retournee', 9000, 9000, null, null, null, null),
  (99, 'Nassim Mezzaa', '+33665187404', '2026-09-23', false, false, 'reservee', 9000, 5000, null, null, null, null),
  (100, 'Laouar rabeh', '0770367628', '2026-09-17', true, true, 'retournee', 7500, 7500, null, null, null, null),
  (101, 'Laouar rabeh', '0770367628', '2026-09-17', true, true, 'retournee', 2500, 2500, null, null, null, null),
  (102, 'Hicham medjahri', '0670430119', '2026-09-30', false, false, 'reservee', 11000, 11000, null, null, null, null),
  (103, 'Mustafa amtout 📍(Oued Rhiou)', '0773206568', '2026-09-27', false, false, 'reservee', 9000, 6000, null, null, null, null),
  (104, 'Hassan Bettich', '0793364931', '2026-09-18', true, false, 'en_cours', 3000, 3000, null, null, null, null),
  (105, 'Ramou Mansour', '0661840084', '2026-09-18', true, false, 'en_cours', 8000, 8000, null, null, null, null),
  (106, 'Rabah laouar', null, '2026-09-17', true, true, 'retournee', 7500, 7500, null, null, null, null),
  (107, 'Walid benani', '0778697183', '2026-09-17', true, false, 'en_cours', 7000, 7000, null, null, null, null),
  (110, 'Mohamed wiz', '0669610808', '2026-09-17', true, false, 'en_cours', 2000, 2000, null, null, null, null),
  (112, 'Lekhal laid', '0662245447', '2026-09-25', false, false, 'reservee', 11500, 3500, null, null, null, null),
  (113, 'Oussama sari', null, '2026-09-18', false, false, 'reservee', 0, 0, null, null, null, null),
  (114, 'Adama houari', '0792318241', '2026-09-18', false, false, 'reservee', 0, 0, null, null, null, null),
  (115, 'Salaa sghayer', '0771575890', '2026-09-25', false, false, 'reservee', 14000, 0, null, null, null, null),
  (116, 'Sofiane chorfi', '0673438666', '2026-09-25', false, false, 'reservee', 8000, 0, null, null, null, null),
  (117, 'Younes abida', '0670390465', '2026-09-20', true, false, 'en_cours', 4500, 4500, null, null, null, null)
on conflict (row_no) do update set
  customer_name  = excluded.customer_name,
  customer_phone = excluded.customer_phone,
  event_date     = excluded.event_date,
  picked_up      = excluded.picked_up,
  returned       = excluded.returned,
  status         = excluded.status,
  total_price    = excluded.total_price,
  amount_paid    = excluded.amount_paid,
  notes          = excluded.notes,
  fee_amount     = excluded.fee_amount,
  fee_category   = excluded.fee_category,
  fee_label      = excluded.fee_label;

-- -----------------------------------------------------------------------------
-- 4. Les vêtements : une ligne par colonne remplie du tableur.
--
-- `piece_no` 1 est la tenue (colonne COSTUMES), qui porte le prix et la
-- colonne « Tailleur » en note ; viennent ensuite la chemise et les
-- chaussures, à zéro.
-- -----------------------------------------------------------------------------
insert into private.import_booking_lines (
  row_no, piece_no, model_name, size_label, line_note, unit_price
) values
  (3, 1, 'Tuxedo A avec Gelly A', '46', 'TK-525', 8000),
  (3, 2, 'Chemise Cravate Bleu S', null, null, 0),
  (3, 3, 'Achv Marron Foncé 41', null, null, 0),
  (4, 1, 'invite Bue Nuite Croise', '50', 'Gio-079', 7000),
  (4, 2, 'Chemise Blue Simle (L)', null, null, 0),
  (4, 3, 'noir achevie argent', null, null, 0),
  (5, 1, 'Invite Beige Simple', '50', 'TK-405', 8000),
  (5, 2, 'Chemise Blanc simple (XL)', null, null, 0),
  (5, 3, 'Noir brillon achv doré 42', null, null, 0),
  (6, 1, 'Jabador blanc avec beige', '58', null, 4000),
  (7, 1, 'Tuxedo A', 'veste 50 · pantalon 52', null, 10000),
  (7, 2, 'Chemise BRG Line BLANC (L)', null, null, 0),
  (7, 3, 'Noir glasse cordon 43', null, null, 0),
  (8, 1, 'Invite Noir Simple', '48', 'TK-513 (101 Cm)-(9Cm)', 8000),
  (8, 2, 'Chemise blanc encastre (S)', null, null, 0),
  (8, 3, 'Glasse noir 42', null, null, 0),
  (9, 1, 'invite Blue Nuit arriere', 'veste 50 · pantalon 52', 'TK-525 (14CM)', 8000),
  (9, 2, 'Chemise simple blanc (L)', null, null, 0),
  (9, 3, 'marron warda (41)', null, null, 0),
  (10, 1, 'Invite Beige Simple', '48', 'TK-405 (20 CM)', 8000),
  (10, 2, 'Chemise blanc Simple (S)', null, null, 0),
  (10, 3, 'Invite achv argent 41', null, null, 0),
  (11, 1, 'Invite Noir Simple', '52', 'Tk-513', 8000),
  (11, 2, 'Chemise blan simple (L)', null, null, 0),
  (11, 3, 'Achv Noir mat argent(42)', null, null, 0),
  (12, 1, 'Invite Noir Simple', '56', 'Tk-513 (15.5cm)', 8000),
  (12, 2, 'Chemise blan xxl', null, null, 0),
  (12, 3, 'Achv brillion doré(43)', null, null, 0),
  (13, 1, 'Pantalon Invite Noir', '52', null, 0),
  (13, 2, 'gravat rouge', null, null, 0),
  (14, 1, 'Gely B', '48', null, 0),
  (15, 1, 'Tuxedo A', 'veste 50 · pantalon 52', '(14 CM)', 9000),
  (15, 2, 'Chemise blanc simple (L)', null, null, 0),
  (15, 3, 'Glass noir 40', null, null, 0),
  (16, 1, 'Tuxedo F Gillet D +Jabador xxl vert', 'veste 56 · pantalon 58', '(16Cm)', 15000),
  (16, 2, 'Chemise Brgline blanc (xxl)', null, null, 0),
  (16, 3, 'Noir glasse 43+ bligha 44 jaune', null, null, 0),
  (17, 1, 'Invite Beige Simple', 'veste 50 · pantalon 52', '90cm', 6000),
  (17, 2, 'Chemise blan simple(xl)', null, null, 0),
  (17, 3, 'Maron(43)', null, null, 0),
  (18, 1, 'Invite Noir Simple', '48', 'TK-513 🫨', 8500),
  (18, 2, 'Chemise blan simple (M)', null, null, 0),
  (18, 3, 'Noir glass achevie gold 41', null, null, 0),
  (19, 1, 'Invite Beige Simple', '48', 'Tk-405 🫨', 8500),
  (19, 2, 'Chemise simple blan (M)', null, null, 0),
  (19, 3, 'Marron papilon 41', null, null, 0),
  (20, 1, '3riss A + jabador vert avec blanc', 'veste 52 · pantalon 50', null, 14000),
  (20, 2, 'Chemise blanc BRG LINE (M)', null, null, 0),
  (20, 3, 'Noir brillon achv doré 43 bligha blanc 43', null, null, 0),
  (21, 1, '3riss D +bernouss copé', '48', '86 Cm', 13000),
  (21, 2, 'Chemise BRG M', null, null, 0),
  (21, 3, 'Cordon mat 40', null, null, 0),
  (22, 1, 'Invité bleu arilleur', '46', null, 6500),
  (22, 2, 'Chemise noir(M)', null, null, 0),
  (23, 1, '3riss E', 'veste 54 · pantalon 56', '(19CM)', 9000),
  (23, 2, 'chemise simple (XXL)', null, null, 0),
  (23, 3, 'Glass noir 42', null, null, 0),
  (24, 1, 'invite Bue Nuite Croise', '52', null, 8000),
  (24, 2, 'Chemise Blanc gravate (L)', null, null, 0),
  (24, 3, 'Chr Dorre Glasse 43', null, null, 0),
  (25, 1, 'jabador rouge', null, null, 4000),
  (25, 2, 'bligha 42', null, null, 0),
  (26, 1, 'invite gris', 'veste 52 · pantalon 56', '97.5 Cm', 11000),
  (26, 2, 'chemis noir L', null, null, 0),
  (26, 3, 'cordon mat 42 (te meroune)', null, null, 0),
  (27, 1, 'invite Bue Nuite Croise', 'veste 50 · pantalon 54', null, 9000),
  (27, 2, 'chemise Blanc gravatte XL', null, null, 0),
  (27, 3, 'chr argent 43', null, null, 0),
  (28, 1, '3riss E + JABADOR blanc', '50', null, 12000),
  (28, 2, 'Chemise BRG blan(M)', null, null, 0),
  (28, 3, 'Glass noir 40 +Bligha beige 43', null, null, 0),
  (29, 1, '3riss A', 'veste 46 · pantalon 48', '92 cm', 10000),
  (29, 2, 'chrmis blanc encastre (S)', null, null, 0),
  (29, 3, 'chaussure noire achevé glasse', null, null, 0),
  (30, 1, 'barnous noir twil', null, null, 4000),
  (30, 2, 'bligha bayda 43', null, null, 0),
  (31, 1, 'Beige', '50', '52', 9000),
  (31, 2, 'chemise noir Simple (XL)', null, null, 0),
  (31, 3, 'chr noir simple glasse cordon', null, null, 0),
  (32, 1, 'chemise BRG LINE ( L)', null, null, 0),
  (33, 1, 'Invite Blue croise', 'veste 50 · pantalon 54', '15 Cm', 9000),
  (33, 2, 'Xl blanc simple', null, null, 0),
  (33, 3, 'Achv argent 43', null, null, 0),
  (34, 1, 'Invite vert', 'veste 46 · pantalon 52', null, 8000),
  (34, 2, 'Blan (L)', null, null, 0),
  (34, 3, 'Glasse dore(42)', null, null, 0),
  (35, 1, '3riss D', '44', '24cm', 10000),
  (35, 2, 'Chemise gravate (S)', null, null, 0),
  (36, 1, 'Invite vert', '46', '(11cm)', 7000),
  (36, 2, 'Chemise blan simple(s)', null, null, 0),
  (37, 1, '3riss A+ Jabador Vert 80', 'veste 46 · pantalon 48', '(21CM) (slimi)', 14000),
  (37, 2, 'Chemise Button Encastre (M)', null, null, 0),
  (37, 3, 'glasse noir 41+ Bligha beige 43', null, null, 0),
  (38, 1, 'invite gris avec black', '48', 'Prt-525 (20Cm)', 7000),
  (38, 2, 'Chemise noir Simple (S)', null, null, 0),
  (39, 1, '3riss B+ Barnous', '44', '84cm', 13000),
  (39, 2, 'Chemise blan (S)', null, null, 0),
  (39, 3, 'Achv noir mat(41)', null, null, 0),
  (40, 1, 'Invite bleu nuit + Barnous', 'veste 50 · pantalon 54', '97cm', 10000),
  (40, 2, 'Achv maron claire', null, null, 0),
  (41, 1, 'Achv dore 40', null, null, 1000),
  (42, 1, 'Invite bleu nuit Croise', 'veste 46 · pantalon 50', '8 cm', 8000),
  (42, 2, 'Chemise simple blanc (M)', null, null, 0),
  (42, 3, 'Achevie noir mat argant (41)', null, null, 0),
  (43, 1, 'Invite vert croise', 'veste 48 · pantalon 50', '97 cm', 8000),
  (43, 2, 'Chemise Blanc L+Gravatte', null, null, 0),
  (43, 3, 'Achv marron foncé 41', null, null, 0),
  (44, 1, '3riss (E)', 'veste 44 · pantalon 46', '92cm', 10000),
  (44, 2, 'Chemis BRG LINE (S)', null, null, 0),
  (44, 3, 'Glasse simple 40', null, null, 0),
  (45, 1, '3ris +Jabador blanc+ Barnous black', '46', 'F (19cm)', 15000),
  (45, 2, 'chemise noir simple (s)', null, null, 0),
  (45, 3, 'glass cordone 41 Bligha beige 42', null, null, 0),
  (46, 1, 'Invite gris (10000 Da Consille)⚠️', 'veste 50 · pantalon 52', '25cm', 8000),
  (46, 2, 'Chemise simple blan(M)', null, null, 0),
  (46, 3, 'Achv noir brillion doré(42)', null, null, 0),
  (47, 1, '3riss F', 'veste 54 · pantalon 56', '13cm', 10000),
  (47, 2, 'Chemise blan simple(xxl)', null, null, 0),
  (47, 3, 'Cordon noir mat(42)', null, null, 0),
  (48, 1, '3riss B', 'veste 54 · pantalon 50', '105cm', 7000),
  (49, 1, 'Beige', 'veste 50 · pantalon 52', null, 10000),
  (49, 2, 'Noir L', null, null, 0),
  (49, 3, 'Marron foncé 42', null, null, 0),
  (50, 1, 'Invite Beige', '58', '95 cm', 10000),
  (50, 2, 'Noir 4xl', null, null, 0),
  (51, 1, 'B', '50', '94', 10000),
  (51, 2, 'XL blanc', null, null, 0),
  (51, 3, 'Cordon mat 44', null, null, 0),
  (52, 1, 'Pontalon noir (costume invt noir)', '54', null, 4000),
  (52, 2, 'Noir (xxl)', null, null, 0),
  (52, 3, 'Maron foncé (42)', null, null, 0),
  (54, 1, 'Inviti rouge', '48', '15 Cm', 8000),
  (54, 2, 'Chemise blan (M)', null, null, 0),
  (54, 3, 'Achev maron (41)', null, null, 0),
  (55, 1, 'E', 'veste 50 · pantalon 48', '97', 10000),
  (55, 2, 'Brg (M)', null, null, 0),
  (55, 3, 'Cordon mat 43', null, null, 0),
  (56, 1, 'Senture + gravate noir (berbery)', null, null, 1000),
  (57, 1, 'pantalon 48', null, null, 5000),
  (57, 2, 'chemis noire (S)', null, null, 0),
  (57, 3, 'chr achv 42 glassé dore', null, null, 0),
  (58, 1, 'pantalon noir (gris) 50', null, '91 cm', 5000),
  (58, 2, 'chemis blanc simple (S)', null, null, 0),
  (58, 3, 'chr demi mat 42', null, null, 0),
  (59, 1, 'Costume greuna', 'veste 50 · pantalon 52', '102 cm', 7500),
  (59, 2, 'Chemise blanc L+gravatte rouge+warda blue', null, null, 0),
  (59, 3, 'Chr marron clair 43', null, null, 0),
  (60, 1, 'jabador rouge (XXL )', null, null, 4500),
  (62, 1, 'Invt vert', 'veste 50 · pantalon 48', '102 cm', 8000),
  (62, 2, 'Noir (M)', null, null, 0),
  (62, 3, 'Achv noir argent pt 42', null, null, 0),
  (63, 1, 'Invite Blue Nuit Croise', '52', '103cm', 8000),
  (63, 2, 'Chemise Papillon Blanc M', null, null, 0),
  (63, 3, 'Achv argent 43', null, null, 0),
  (64, 1, '3riss B + barnouss 9sir', '46', '88cm', 14000),
  (64, 2, 'Chemise papilon (S)', null, null, 0),
  (64, 3, 'Brillon simple(42)', null, null, 0),
  (65, 1, 'Invite noir', 'veste 52 · pantalon 56', null, 9000),
  (65, 2, 'Papillon simple (L)', null, null, 0),
  (65, 3, 'Achev noir mat argent 41', null, null, 0),
  (66, 1, 'G + jabador beige', '48', null, 13000),
  (66, 2, 'M simple blanc', null, null, 0),
  (66, 3, 'Glasse (خط ) 40 + bligha beige 43', null, null, 0),
  (67, 1, 'D', '52', '97', 9000),
  (67, 2, 'XL Blanc encastré+ Gravatte', null, null, 0),
  (67, 3, 'Achv argent 42', null, null, 0),
  (68, 1, '3riss A', '50', '90 cm papillon mixen', 12000),
  (68, 2, 'chemis blanc BRG (M)', null, null, 0),
  (68, 3, 'Chr 42 glasse cordone mzawe9 +bligha 43 blanc', null, null, 0),
  (69, 1, 'C + barnous beige', '56', '95', 12000),
  (69, 2, 'XL blanc encastré', null, null, 0),
  (69, 3, 'Cordon simple 44', null, null, 0),
  (70, 1, 'Tuxedo C avec Gelly C', '52', '91.5', 15000),
  (70, 2, 'Chemise Cravate Blanc L', null, null, 0),
  (70, 3, 'Achv Demi Mat 43', null, null, 0),
  (71, 1, 'Pantalon invite noir 50', '50', '93', 3500),
  (71, 2, 'Simple encastre (M)', null, null, 0),
  (72, 1, '3riss (A) + jabador rouge (S)', '48', null, 15000),
  (72, 2, 'BRG LINE (M)', null, null, 0),
  (72, 3, 'Demi mat 40', null, null, 0),
  (73, 1, 'C', 'veste 50 · pantalon 52', '90', 11000),
  (73, 2, 'BRG LINE (L)', null, null, 0),
  (73, 3, 'Demi mat 41', null, null, 0),
  (74, 1, 'A + jabador vert', '46', '25 cm', 15000),
  (74, 2, 'Chemis blanc encastré (s)', null, null, 0),
  (74, 3, 'Glasse simple 40', null, null, 0),
  (75, 1, 'Tuxedo F avec Gelly F', 'veste 50 · pantalon 48', '❌(91cm)', 11500),
  (75, 2, 'Chemise Papillon Blanc M', null, null, 0),
  (75, 3, 'Achv Doré 43', null, null, 0),
  (76, 1, '3riss (C)', '46', '99cm', 12000),
  (76, 2, 'chemis BRG LINE (M)', null, null, 0),
  (76, 3, 'glassé simple 43', null, null, 0),
  (77, 1, 'Bleu croise', '50', '93', 7000),
  (77, 2, '(L) gravvate blanc', null, null, 0),
  (77, 3, 'Maaron foncie 41', null, null, 0),
  (78, 1, 'Jabador rouge sghir', null, null, 5000),
  (78, 2, 'Bligha blan(43)', null, null, 0),
  (79, 1, 'invité noire', '48', null, 9000),
  (79, 2, 'chemis blanc ( S)', null, null, 0),
  (79, 3, 'chr noire 42 ( tea aek )', null, null, 0),
  (80, 1, 'Jabador vert XXL', null, 'XXL', 5000),
  (80, 2, 'bligha 44 safra', null, null, 0),
  (81, 1, 'D', '50', '94.5', 10000),
  (81, 2, 'L encastre papillon', null, null, 0),
  (81, 3, 'Chr cordon 41 glasse', null, null, 0),
  (82, 1, '3riss (A)', '46', '96cm', 10000),
  (82, 2, 'Chemise BRG(s)', null, null, 0),
  (82, 3, 'Glasse noir simple (41)', null, null, 0),
  (83, 1, '3riss (D)', '54', null, 10000),
  (83, 2, 'BRG LINE blanc (XL)', null, null, 0),
  (83, 3, '43 glasse gold', null, null, 0),
  (84, 1, '3riss (E)', 'veste 48 · pantalon 46', '92 cm', 12000),
  (84, 2, 'chemis blanc simple papillon (M)', null, null, 0),
  (84, 3, 'chr 41 glassé (خط)', null, null, 0),
  (85, 1, 'Invité noire', '50', '98 cm', 7000),
  (85, 2, 'L blanc', null, null, 0),
  (85, 3, '41 glassé avec doré', null, null, 0),
  (86, 1, 'A', 'veste 52 · pantalon 50', '95', 8000),
  (86, 2, 'XL blanc encastre', null, null, 0),
  (86, 3, 'Glasse simple 40', null, null, 0),
  (87, 1, 'B', 'veste 52 · pantalon 50', '96 cm', 9000),
  (87, 2, 'Papillon encastre (L)', null, null, 0),
  (87, 3, 'Brillon 40', null, null, 0),
  (88, 1, 'A', 'veste 56 · pantalon 58', '93cm', 17000),
  (88, 2, 'Simple papillon 3xl', null, null, 0),
  (88, 3, 'Cordon brillon (44)', null, null, 0),
  (89, 1, 'Barnous beige coupé', null, null, 4000),
  (90, 1, 'E', 'veste 44 · pantalon 48', '91cm', 10000),
  (90, 2, 'Brg blan (M)', null, null, 0),
  (90, 3, 'Cordon glasse 39', null, null, 0),
  (91, 1, 'Invité vert 52', '52', '94cm', 9000),
  (91, 2, 'Noir (XL)', null, null, 0),
  (91, 3, 'Maron clair (41)', null, null, 0),
  (92, 1, '3riss D+ jabador beige', 'veste 52 · pantalon 50', '5.5cm', 15000),
  (92, 2, 'Chemise BRG (M)', null, null, 0),
  (92, 3, 'Cordone matt(41)', null, null, 0),
  (93, 1, 'Bleu nuit croisé', 'veste 46 · pantalon 48', null, 8000),
  (93, 2, 'Simple blan (L)', null, null, 0),
  (93, 3, 'Demi mat (43)', null, null, 0),
  (94, 1, 'Invite beige', '48', null, 9000),
  (94, 2, 'Papillon (s)', null, null, 0),
  (94, 3, 'Achv Glasse dore 40', null, null, 0),
  (95, 1, 'invité vert', 'veste 48 · pantalon 50', '97cm', 8000),
  (95, 2, 'chemis blanc simple (L)', null, null, 0),
  (95, 3, 'Marron claire argent (43)', null, null, 0),
  (96, 1, 'Jabador vert (L) 82', null, null, 4000),
  (96, 2, 'Bligha 41', null, null, 0),
  (97, 1, 'A', 'veste 54 · pantalon 56', '95 cm', 12000),
  (97, 2, 'Blanc encastre xxl', null, null, 0),
  (97, 3, 'Cordon glasse simple 44', null, null, 0),
  (98, 1, 'Invite bleu nuit croise', '54', '94', 9000),
  (98, 2, 'Simple blan (xxl)', null, null, 0),
  (98, 3, 'Maron clair (42)', null, null, 0),
  (99, 1, 'Invité noire', '52', '92', 9000),
  (99, 2, 'L blanc', null, null, 0),
  (99, 3, 'Demi mat 42', null, null, 0),
  (100, 1, 'Invite gris', 'veste 52 · pantalon 56', null, 7500),
  (100, 2, 'Noir Xl+gravatte', null, null, 0),
  (100, 3, 'Chr Noir glasse simple 44', null, null, 0),
  (101, 1, 'Chemise blanc 2Xl', null, null, 2500),
  (101, 2, 'Bligha blanc 44', null, null, 0),
  (102, 1, 'E', '52', '99cm (slimi 1.5cm)', 11000),
  (102, 2, 'BRG(M) gelly 48', null, null, 0),
  (102, 3, 'Cordon brillon arieur (42)', null, null, 0),
  (103, 1, 'A _ F', '58', '86.5 cm (slimi 14cm)', 9000),
  (103, 2, 'Simple et papillon (3xl)', null, null, 0),
  (103, 3, 'Glasse simple (43)', null, null, 0),
  (104, 1, 'Blasser grenet 52', '52', null, 3000),
  (104, 2, 'Noir XXL', null, null, 0),
  (105, 1, 'Invité croisé vert', 'veste 54 · pantalon 56', '89 Cm', 8000),
  (105, 2, '3XL noir', null, null, 0),
  (105, 3, 'Marron claire 40', null, null, 0),
  (106, 1, 'Invité noire', 'veste 58 · pantalon 56', null, 7500),
  (106, 2, '3 XL blanc', null, null, 0),
  (106, 3, 'Cordon mat 43', null, null, 0),
  (107, 1, 'Blazer beige', '54', null, 7000),
  (107, 2, 'Noir L', null, null, 0),
  (107, 3, 'Marron foncie 42', null, null, 0),
  (110, 1, 'Zara (43)', null, null, 2000),
  (112, 1, 'B', 'veste 54 · pantalon 52', '96cm. Nv', 11500),
  (112, 2, 'BRG (xl)', null, null, 0),
  (112, 3, 'Cordon brillon simple(42)', null, null, 0),
  (113, 1, 'Invité bleu arriere', 'veste 54 · pantalon 56', null, 0),
  (113, 2, 'Bleu ciel (L)', null, null, 0),
  (113, 3, 'Marron claire 44', null, null, 0),
  (114, 1, 'Blanc simple (s)', null, null, 0),
  (114, 2, 'Cordon mat 41', null, null, 0),
  (115, 1, 'Tuxedo D + jabador rouge', '46', null, 14000),
  (115, 2, 'S gravatte', null, null, 0),
  (115, 3, 'Cordon glasse simple 42 +bligha beige 43', null, null, 0),
  (116, 1, 'Invite vert', 'veste 48 · pantalon 50', null, 8000),
  (116, 2, 'Noir simple (s)', null, null, 0),
  (116, 3, 'Achevi demi matt (43)', null, null, 0),
  (117, 1, 'Chemise Cravate Blanc S', '46', null, 4500),
  (117, 2, 'Achv Demi Mat 41', null, null, 0)
on conflict (row_no, piece_no) do update set
  model_name = excluded.model_name,
  size_label = excluded.size_label,
  line_note  = excluded.line_note,
  unit_price = excluded.unit_price;

-- -----------------------------------------------------------------------------
-- 5. Création des commandes, puis de leurs pièces.
--
-- Une boucle et non un INSERT ... SELECT : il faut récupérer l'`id` de chaque
-- commande pour le réinscrire dans le journal, y rattacher ses pièces et sa
-- dépense. Un INSERT groupé ne permet pas de relier les lignes rendues à leur
-- ligne d'origine.
-- -----------------------------------------------------------------------------
do $import$
declare
  b         private.import_bookings%rowtype;
  p         private.import_booking_lines%rowtype;
  v_order   bigint;
  v_line    bigint;
  n_orders  integer := 0;
  n_notes   integer := 0;
  n_pieces  integer := 0;
  n_fees    integer := 0;
begin
  for b in select * from private.import_bookings order by row_no loop
    if b.order_id is null then
      insert into public.orders (
        customer_name, customer_phone, event_date,
        subtotal, discount, total_price, amount_paid,
        picked_up, returned, status, notes
      )
      values (
        b.customer_name, b.customer_phone, b.event_date,
        b.total_price, 0, b.total_price, b.amount_paid,
        b.picked_up, b.returned, b.status, b.notes
      )
      returning id into v_order;

      update private.import_bookings
      set order_id = v_order, imported_at = now()
      where row_no = b.row_no;

      n_orders := n_orders + 1;
    else
      v_order := b.order_id;

      -- Rattrapage de la première version : ses notes portaient les vêtements,
      -- qui deviennent des pièces plus bas.
      update public.orders
      set notes = b.notes
      where id = v_order and notes is distinct from b.notes;

      if found then n_notes := n_notes + 1; end if;
    end if;

    -- « Les frais (-) » : une dépense rattachée à la commande. Le libellé du
    -- tableur est conservé mot pour mot — « -1250 Da (Tailleur) » — parce que
    -- c'est lui qui dit à qui l'argent est allé.
    --
    -- Le garde `not exists` tient lieu de journal : une dépense déjà posée sur
    -- cette commande par une reprise précédente ne se dédouble pas.
    if b.fee_amount is not null and b.fee_amount > 0
       and not exists (select 1 from public.expenses where order_id = v_order)
    then
      insert into public.expenses (spent_on, category, amount, description, order_id)
      values (b.event_date, b.fee_category, b.fee_amount, b.fee_label, v_order);
      n_fees := n_fees + 1;
    end if;
  end loop;

  -- Les pièces, après : elles ont besoin de la commande, et le rattrapage de
  -- la première version en a créé aucune.
  for p in
    select l.*
    from private.import_booking_lines l
    join private.import_bookings o on o.row_no = l.row_no
    where l.line_id is null and o.order_id is not null
    order by l.row_no, l.piece_no
  loop
    insert into public.order_lines (
      order_id, model_name_snapshot, size_snapshot, line_note, unit_price
    )
    select o.order_id, p.model_name, p.size_label, p.line_note, p.unit_price
    from private.import_bookings o
    where o.row_no = p.row_no
    returning id into v_line;

    update private.import_booking_lines
    set line_id = v_line
    where row_no = p.row_no and piece_no = p.piece_no;

    n_pieces := n_pieces + 1;
  end loop;

  raise notice 'Reprise du tableur : % commandes, % pièces, % dépenses, % notes réécrites.',
    n_orders, n_pieces, n_fees, n_notes;
end
$import$;
