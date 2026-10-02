-- =============================================================================
-- Reprise du tableur, seconde passe — export du 02/10/2026
--
-- Le tableur a continué de vivre après la première reprise
-- (`20260921120000_import_tableur_bookings`) : de nouvelles réservations, et
-- des commandes déjà reprises qui ont depuis été retirées, rendues ou soldées.
--
-- LES LIGNES ONT BOUGÉ — ON NE SE FIE PAS À LEUR NUMÉRO
--
-- Entre les deux exports, des lignes ont été vidées, déplacées, renommées
-- (« Lekhal laid » → « Belekhal laid », trois clients devenus « inconnu »).
-- Le rapprochement avec l'existant s'est donc fait sur le TÉLÉPHONE et la DATE
-- de l'événement, à défaut sur le nom et la date : 108 lignes du tableur
-- désignent une commande déjà en base, 41 sont nouvelles.
--
-- 1. LES COMMANDES DÉJÀ EN BASE AVANCENT, ELLES NE RECULENT JAMAIS
--
--    L'équipe se sert déjà de l'application : une case cochée ou un versement
--    encaissé ici ne doit pas être effacé par un tableur moins à jour. D'où :
--    * une case passe à vrai si le tableur la coche ; jamais l'inverse ;
--    * le versement monte jusqu'à VERS s'il est plus haut ; jamais l'inverse,
--      et jamais au-delà du prix ;
--    * une commande ANNULÉE n'est pas touchée ;
--    * le PRIX n'est pas modifié : il est la somme des pièces. Les quatre
--      écarts (mohamed hamani, Chraitia djamal, Fethi messali, Sidahmed
--      fotograf) sont à trancher à la main sur la fiche.
--
--    Le trigger déduit le statut des cases. Il daterait aussi le retour
--    d'AUJOURD'HUI — faux pour un costume rendu il y a deux semaines. Le
--    tableur ne note pas ce jour : on retient le retour PRÉVU (J+1), comme si
--    le client était à l'heure.
--
-- 2. LES NOUVELLES COMMANDES suivent les règles de la première reprise et de
--    la saisie rapide :
--    * une ligne par vêtement — la colonne COSTUMES se découpe sur « , »
--      (« Jabador S - Vert , Tuxedo C avec Gelly C » = deux pièces), puis
--      chemise, chaussures, accessoires ;
--    * aucune `unit_id` : aucune date bloquée dans le stock ;
--    * tailles au format de la saisie : « 52 · G 48 · P 54 » ;
--    * le prix sur la première pièce, la colonne « Tailleur » en note ;
--    * « Consign 6000 da » (Bouksara ghani 2) part en note, pas en caution
--      — même prudence que la première reprise.
--
--    Elles entrent au journal `private.import_bookings` sous le numéro
--    1000 + ligne du tableur : les numéros 3 à 117 y désignent l'ANCIEN
--    export, et la ligne 115 d'aujourd'hui n'est plus le client d'alors.
--    Rejouer ce fichier ne crée donc rien en double.
--
-- Pour annuler les nouvelles commandes :
--   delete from public.orders where id in
--     (select order_id from private.import_bookings where row_no > 1000);
--   delete from private.import_bookings where row_no > 1000;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Les commandes déjà en base : (id, retirée, rendue, VERS du tableur).
-- -----------------------------------------------------------------------------
with sheet (id, picked_up, returned, paid) as (
  values
  (262, true, true, 8000),
  (263, true, true, 7000),
  (264, true, true, 8000),
  (265, true, true, 4000),
  (266, true, true, 10000),
  (267, true, true, 8000),
  (268, true, true, 8000),
  (269, true, true, 8000),
  (270, true, true, 8000),
  (271, true, true, 8000),
  (272, true, true, 0),
  (273, true, true, 2000),
  (274, true, true, 9000),
  (275, true, true, 15000),
  (276, true, true, 6000),
  (277, true, true, 8500),
  (278, true, true, 8500),
  (279, true, true, 14000),
  (280, true, true, 13000),
  (281, true, true, 6500),
  (282, true, true, 9000),
  (283, true, true, 0),
  (284, true, true, 4000),
  (285, true, true, 11000),
  (286, true, true, 9000),
  (287, true, true, 12000),
  (288, true, true, 10000),
  (289, true, true, 4000),
  (290, true, true, 9000),
  (292, true, true, 9000),
  (293, true, true, 8000),
  (294, true, true, 0),
  (296, true, true, 14000),
  (297, true, true, 7000),
  (298, true, true, 13000),
  (299, true, true, 10000),
  (300, true, true, 1000),
  (301, true, true, 8000),
  (302, true, true, 8000),
  (303, true, true, 10000),
  (304, true, true, 15000),
  (305, true, true, 8000),
  (306, true, true, 10000),
  (307, true, true, 7000),
  (308, true, true, 0),
  (309, true, true, 0),
  (310, true, true, 0),
  (311, true, true, 4000),
  (312, true, true, 8000),
  (313, true, true, 10000),
  (314, true, true, 1000),
  (315, true, true, 5000),
  (316, true, true, 5000),
  (317, true, true, 7500),
  (318, true, true, 4500),
  (319, true, true, 8000),
  (320, true, true, 8000),
  (321, true, true, 14000),
  (322, true, true, 9000),
  (323, true, true, 13000),
  (324, true, true, 9000),
  (325, true, true, 7000),
  (326, true, true, 12000),
  (327, true, true, 15000),
  (328, true, true, 5500),
  (329, true, true, 15000),
  (330, true, true, 11000),
  (331, true, true, 15000),
  (332, true, true, 11500),
  (333, true, true, 12000),
  (334, true, true, 7000),
  (335, true, true, 5000),
  (336, true, true, 9000),
  (337, true, true, 5000),
  (338, true, true, 10000),
  (339, true, true, 10000),
  (340, true, true, 10000),
  (341, true, true, 12000),
  (342, true, true, 7000),
  (343, true, true, 8000),
  (344, true, true, 9000),
  (345, true, true, 12000),
  (346, true, true, 4000),
  (347, true, true, 10000),
  (348, true, true, 9000),
  (349, true, true, 15000),
  (350, true, true, 8000),
  (352, true, true, 8000),
  (353, true, false, 4000),
  (354, true, true, 12000),
  (355, true, true, 9000),
  (356, true, true, 9000),
  (357, true, true, 7500),
  (358, true, true, 2500),
  (359, true, false, 11000),
  (360, true, true, 9000),
  (361, true, true, 3000),
  (362, true, true, 8000),
  (363, true, true, 7500),
  (364, true, true, 7000),
  (365, true, true, 2000),
  (366, true, true, 11500),
  (367, true, true, 0),
  (368, true, true, 0),
  (369, true, true, 14000),
  (370, true, true, 8000),
  (371, true, true, 4500),
  (351, true, true, 9000)
)
update public.orders o
set picked_up   = o.picked_up or s.picked_up,
    returned    = o.returned or s.returned,
    actual_return_date = case
      when s.returned and not o.returned then o.return_due_date
      else o.actual_return_date
    end,
    amount_paid = greatest(o.amount_paid, least(s.paid, o.total_price))
from sheet s
where o.id = s.id
  and o.status <> 'annulee'
  and (
    (s.picked_up and not o.picked_up)
    or (s.returned and not o.returned)
    or least(s.paid, o.total_price) > o.amount_paid
  );

-- -----------------------------------------------------------------------------
-- 2. Les nouvelles lignes du tableur.
-- -----------------------------------------------------------------------------
insert into private.import_bookings (
  row_no, customer_name, customer_phone, event_date, picked_up, returned,
  status, total_price, amount_paid, notes, fee_amount, fee_category, fee_label
) values
  (1115, 'inconnu', '0656717150', '2026-09-24', true, true, 'retournee', 15000, 15000, null, null, null, null),
  (1117, 'inconnu', null, '2026-09-19', true, true, 'retournee', 1500, 1500, null, null, null, null),
  (1118, 'Berrahal Rachid', '0667312274', '2026-10-01', true, false, 'en_cours', 8000, 8000, null, null, null, null),
  (1119, 'inconnu', '0775235575', '2026-09-24', true, true, 'retournee', 11000, 11000, null, null, null, null),
  (1120, 'inconnu', '0541308288', '2026-09-24', true, true, 'retournee', 10000, 10000, null, null, null, null),
  (1121, 'inconnu', '0553798009', '2026-09-24', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (1122, 'Tahri said', '0558555344', '2026-09-25', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (1123, 'Benadidou amar', '0656567206', '2026-10-01', true, false, 'en_cours', 8000, 8000, null, null, null, null),
  (1124, 'Berrahal youcef', '0667312274', '2026-10-01', true, false, 'en_cours', 10000, 10000, null, null, null, null),
  (1125, 'Bencheni mohamed', '0666923873', '2026-09-29', true, true, 'retournee', 7000, 7000, null, null, null, null),
  (1126, 'Mahi aboubaker', '0540516518', '2026-10-01', true, false, 'en_cours', 7000, 7000, null, null, null, null),
  (1127, 'Hamo amani', '0776565239', '2026-09-25', true, true, 'retournee', 9000, 9000, null, null, null, null),
  (1129, 'Mezilet abdelkader', '0672300090', '2026-10-24', false, false, 'reservee', 13000, 3000, null, null, null, null),
  (1130, 'Matmour tahar', '0794959472', '2026-10-14', false, false, 'reservee', 8000, 4000, null, null, null, null),
  (1131, 'Kassar yassine', '0667502729', '2026-09-28', true, true, 'retournee', 15000, 15000, null, null, null, null),
  (1132, 'Rayane jari', '0792108024', '2026-09-24', true, true, 'retournee', 5500, 5500, null, null, null, null),
  (1133, 'Brahim boubout', '0782701314', '2026-09-25', true, true, 'retournee', 6000, 6000, null, null, null, null),
  (1134, 'Sofiane toumi', '0794331209', '2026-10-03', false, false, 'reservee', 3000, 2000, null, null, null, null),
  (1135, 'Benkrich bendhiba', null, '2026-09-25', true, true, 'retournee', 8000, 8000, null, null, null, null),
  (1136, 'Boutchaida bachir', '0670269206', '2026-10-16', false, false, 'reservee', 13000, 0, null, null, null, null),
  (1137, 'Mkenfer arbi', '0673438666', '2026-09-25', true, true, 'retournee', 11000, 11000, null, null, null, null),
  (1138, 'Hattab miloud', '0697721428', '2026-10-30', false, false, 'reservee', 0, 0, null, null, null, null),
  (1139, 'Sofiane Salaa 2 (Rah Day Costume ta3 Youcef Berrahel)', '0666711131', '2026-09-25', true, true, 'retournee', 11000, 11000, null, null, null, null),
  (1140, 'Sassi mohamed el amine', '0784800748', '2026-09-24', true, true, 'retournee', 9000, 9000, null, null, null, null),
  (1141, 'Bendida kheirddine', '0671205952', '2026-09-25', true, true, 'retournee', 8500, 8500, null, null, null, null),
  (1143, 'Latrech nadir', '0659466908', '2026-09-27', true, true, 'retournee', 3500, 3500, null, null, null, null),
  (1144, 'Genouna larbi', '0657114463', '2026-10-09', false, false, 'reservee', 5000, 2000, null, null, null, null),
  (1145, 'Ganouna nasreddine', '0660609564', '2026-10-09', false, false, 'reservee', 11000, 4000, null, null, null, null),
  (1146, 'Belayachi hamouda', '0540099449', '2026-10-15', false, false, 'reservee', 6000, 2000, null, null, null, null),
  (1149, 'Islam karbaa', '0792737481', '2026-10-03', false, false, 'reservee', 6000, 1000, null, null, null, null),
  (1153, 'Abdelghani khelifa', '0776590149', '2026-10-15', false, false, 'reservee', 13000, 0, null, null, null, null),
  (1154, 'Emro esen', '0699743146', '2026-09-29', true, true, 'retournee', 6000, 6000, null, null, null, null),
  (1155, 'Alparslan kds', '0699743146', '2026-09-29', true, true, 'retournee', 4500, 4500, null, null, null, null),
  (1156, 'Boubakar ganouna', '0776519151', '2026-10-01', true, false, 'en_cours', 12000, 12000, null, null, null, null),
  (1157, 'Amine amara', '0791031795', '2026-10-02', true, false, 'en_cours', 10000, 10000, null, null, null, null),
  (1158, 'Bouksara ghani 2', '0558596246', '2026-10-01', true, false, 'en_cours', 8000, 8000, 'Consign 6000 da', null, null, null),
  (1159, 'Lasla saif eddine', '0780953743', '2026-10-02', true, false, 'en_cours', 14000, 14000, null, null, null, null),
  (1160, 'Benhamadi houcine', '067489281', '2026-10-01', true, false, 'en_cours', 8000, 8000, null, null, null, null),
  (1162, 'Berrichi Rayane', '0654094085', '2026-10-02', false, false, 'reservee', 5000, 5000, null, null, null, null),
  (1163, 'Fares karbaa', '0779638038', '2026-10-03', true, false, 'en_cours', 8000, 8000, null, null, null, null),
  (1164, 'Kafif Abdelaziz', '0771715958', '2026-10-16', false, false, 'reservee', 0, 0, null, null, null, null)
on conflict (row_no) do nothing;

insert into private.import_booking_lines (
  row_no, piece_no, model_name, size_label, line_note, unit_price
) values
  (1115, 1, 'Tuxedo C avec Gelly C', '52', '90 cm', 15000),
  (1115, 2, 'Jabador S - Vert', null, null, 0),
  (1115, 3, 'Chemise Papillon Blanc L', null, null, 0),
  (1115, 4, 'Cordon Glacé Simple 42', null, null, 0),
  (1117, 1, 'Cordon Glacé Simple 41', null, null, 1500),
  (1118, 1, 'Invite Vert Croise', '48 · G 48 · P 54', '93.5 Cm', 8000),
  (1118, 2, 'Chemise Cravate Noir XL', null, null, 0),
  (1118, 3, 'Achv Marron Clair 42', null, null, 0),
  (1119, 1, 'Invite Beige Simple', '54 · G 54', '95', 11000),
  (1119, 2, 'Chemise Papillon Blanc 2XL', null, null, 0),
  (1119, 3, 'Achv Marron Clair 42', null, null, 0),
  (1119, 4, 'Papillon', null, null, 0),
  (1120, 1, 'Invite Blue Arriere', '54 · G 56 · P 56', '97 cm', 10000),
  (1120, 2, 'Chemise Cravate Bleu 2XL', null, null, 0),
  (1120, 3, 'Achv Marron Foncé 42', null, null, 0),
  (1120, 4, 'Cravatte', null, null, 0),
  (1121, 1, 'Invite Noir Simple', '54 · G 56', '98.5 cm', 8000),
  (1121, 2, 'Chemise Cravate Noir 2XL', null, null, 0),
  (1121, 3, 'Cordon Mat 43', null, null, 0),
  (1121, 4, 'Cravate', null, null, 0),
  (1122, 1, 'Invite Blue Nuit Croise', '52 · G 52 · P 56', '102 cm', 8000),
  (1122, 2, 'Chemise Cravate Blanc L', null, null, 0),
  (1122, 3, 'Achv Marron Clair 44', null, null, 0),
  (1123, 1, 'Invite Greuna', '56 · G 60 · P 60', '90cm', 8000),
  (1123, 2, 'Chemise Cravate Blanc 4XL', null, null, 0),
  (1123, 3, 'Achv Demi Mat 44', null, null, 0),
  (1124, 1, 'Tuxedo F avec Gelly E', '56 · G 58', '81.5cm', 10000),
  (1124, 2, 'Chemise Cravate Blanc 3XL', null, null, 0),
  (1124, 3, 'Cordon Glacé Arrière 41', null, null, 0),
  (1124, 4, 'Gravate rouge', null, null, 0),
  (1125, 1, 'Jabador XL - Beige', null, null, 7000),
  (1125, 2, 'Bligha Beige 45', null, null, 0),
  (1126, 1, 'Invite Noir Simple', '52 · G 52 · P 46', null, 7000),
  (1126, 2, 'Chemise Cravate Blanc L', null, null, 0),
  (1126, 3, 'Achv Demi Mat 41', null, null, 0),
  (1127, 1, 'Invite Gris', '52 · G 52 · P 54', '96 cm', 9000),
  (1127, 2, 'Chemise Cravate Noir XL', null, null, 0),
  (1127, 3, 'Achv Argent 43', null, null, 0),
  (1127, 4, 'Cravatte gris', null, null, 0),
  (1129, 1, 'Tuxedo F avec Gelly F', '52 · G 52', '93cm', 13000),
  (1129, 2, 'Chemise Papillon Blanc L', null, null, 0),
  (1129, 3, 'Cordon Glacé Simple 41', null, null, 0),
  (1130, 1, 'Tuxedo G avec Gelly G', '46 · G 48', '90cm', 8000),
  (1130, 2, 'Chemise Papillon Blanc M', null, null, 0),
  (1130, 3, 'Cordon Glacé Simple 40', null, null, 0),
  (1131, 1, 'Tuxedo E avec Gelly E', '56 · G 56', '97cm', 15000),
  (1131, 2, 'Jabador M - Vert', null, null, 0),
  (1131, 3, 'Chemise Papillon Blanc 2XL', null, null, 0),
  (1131, 4, 'Cordon Glacé Arrière 43', null, null, 0),
  (1132, 1, 'Invite Noir Simple', '56 · G 56', null, 5500),
  (1132, 2, 'Chemise Zara Noir 2XL', null, null, 0),
  (1132, 3, 'Cordon Mat 42', null, null, 0),
  (1133, 1, 'Jabador M - Grenat', null, null, 6000),
  (1133, 2, 'Bligha Beige 42', null, null, 0),
  (1134, 1, 'Jabador M - Beige', null, null, 3000),
  (1134, 2, 'Bligha Blanc 43', null, null, 0),
  (1135, 1, 'Invite Blue Nuit Croise', '48 · P 50', null, 8000),
  (1135, 2, 'Chemise Cravate Bleu M', null, null, 0),
  (1135, 3, 'Achv Marron Foncé 41', null, null, 0),
  (1136, 1, 'Tuxedo A avec Gelly A', '50 · G 46', '88.5', 13000),
  (1136, 2, 'Chemise Cravate Blanc L', null, null, 0),
  (1136, 3, 'Cordon Mat 41', null, null, 0),
  (1137, 1, 'Tuxedo D avec Gelly D', '44 · G 44 · P 48', null, 11000),
  (1137, 2, 'Chemise Papillon Blanc S', null, null, 0),
  (1137, 3, 'Achv Demi Mat 42', null, null, 0),
  (1138, 1, 'Tuxedo A avec Gelly A', '46 · G 46', 'Mazal…', 0),
  (1138, 2, 'Jabador S - Beige', null, null, 0),
  (1138, 3, 'Chemise Papillon Blanc S', null, null, 0),
  (1138, 4, 'Cordon Glacé Simple 42', null, null, 0),
  (1139, 1, 'Tuxedo D avec Gelly D', '56 · G 56 · P 58', '16 CM', 11000),
  (1139, 2, 'Chemise Cravate Blanc 2XL', null, null, 0),
  (1139, 3, 'Cordon Mat 44', null, null, 0),
  (1139, 4, 'Cordon Glacé Simple 42', null, null, 0),
  (1140, 1, 'Invite Gris', '50 · P 56', null, 9000),
  (1140, 2, 'Chemise Cravate Noir L', null, null, 0),
  (1140, 3, 'Achv Argent 42', null, null, 0),
  (1141, 1, 'Invite Noir Simple', '48 · G 48 · P 44', null, 8500),
  (1141, 2, 'Chemise Cravate Noir S', null, null, 0),
  (1141, 3, 'Achv Doré 41', null, null, 0),
  (1141, 4, 'Cravate rouge + papilon noir', null, null, 0),
  (1143, 1, 'Chemise Cravate Bleu S', null, null, 3500),
  (1143, 2, 'Achv Doré 41', null, null, 0),
  (1143, 3, 'Centure', null, null, 0),
  (1144, 1, 'Pantalon Invite Noir Simple', 'P 56', '98 cm من تحت', 5000),
  (1144, 2, 'Chemise Cravate Bleu 2XL', null, null, 0),
  (1144, 3, 'Achv Marron Clair 44', null, null, 0),
  (1145, 1, 'Tuxedo B avec Gelly B', '56 · G 56 · P 54', '97 cm من تحت', 11000),
  (1145, 2, 'Chemise Cravate Blanc L', null, null, 0),
  (1145, 3, 'Cordon Glacé Simple 41', null, null, 0),
  (1145, 4, 'Cravate noir + papillon noir', null, null, 0),
  (1146, 1, 'Invite Vert Croise', '46 · P 48', '94cm', 6000),
  (1146, 2, 'Chemise Cravate Noir L', null, null, 0),
  (1146, 3, 'Achv Marron Clair 42', null, null, 0),
  (1146, 4, 'Cravate safra', null, null, 0),
  (1149, 1, 'Jabador S - Vert', null, null, 6000),
  (1149, 2, 'Bligha Blanc 43', null, null, 0),
  (1153, 1, 'Tuxedo A avec Gelly A', '56 · G 56 · P 54', '92 cm + slimi', 13000),
  (1153, 2, 'Chemise Papillon Blanc 2XL', null, null, 0),
  (1153, 3, 'Cordon Glacé Simple 42', null, null, 0),
  (1153, 4, 'Papillon', null, null, 0),
  (1154, 1, 'Pantalon A', 'P 58', null, 6000),
  (1154, 2, 'Chemise Cravate Blanc 3XL', null, null, 0),
  (1154, 3, 'Cordon Mat 44', null, null, 0),
  (1154, 4, 'Papillon + senteur', null, null, 0),
  (1155, 1, 'Pantalon A', 'P 54', null, 4500),
  (1155, 2, 'Chemise Cravate Blanc 2XL', null, null, 0),
  (1155, 3, 'Cravate bleu + senteur', null, null, 0),
  (1156, 1, 'Tuxedo C avec Gelly C', '46 · G 46', null, 12000),
  (1156, 2, 'Chemise Papillon Blanc S', null, null, 0),
  (1156, 3, 'Cordon Glacé Arrière 40', null, null, 0),
  (1156, 4, 'Warda bayda', null, null, 0),
  (1157, 1, 'Tuxedo A avec Gelly A', '54 · G 54', '99cm', 10000),
  (1157, 2, 'Chemise Papillon Blanc XL', null, null, 0),
  (1157, 3, 'Achv Doré 42', null, null, 0),
  (1157, 4, 'Papillon mexicene + noir', null, null, 0),
  (1158, 1, 'Invite Noir Simple', '56 · G 56', '90 cm', 8000),
  (1158, 2, 'Chemise Cravate Blanc 2XL', null, null, 0),
  (1158, 3, 'Achv Doré 43', null, null, 0),
  (1159, 1, 'Tuxedo C avec Gelly C', '44 · G 44 · P 46', null, 14000),
  (1159, 2, 'Chemise Papillon Blanc S', null, null, 0),
  (1159, 3, 'Cordon Glacé Simple 41', null, null, 0),
  (1159, 4, 'Papillon brillon (nv)', null, null, 0),
  (1160, 1, 'Invite Noir Simple', '54 · G 54 · P 52', 'Slimi', 8000),
  (1160, 2, 'Chemise Cravate Blanc 2XL', null, null, 0),
  (1160, 3, 'Achv Argent 42', null, null, 0),
  (1160, 4, 'Cravate rouge', null, null, 0),
  (1162, 1, 'Pantalon A', 'P 46', '96.5 Cm', 5000),
  (1162, 2, 'Chemise Cravate Blanc S', null, null, 0),
  (1162, 3, 'Cordon Glacé Simple 40', null, null, 0),
  (1162, 4, 'Cravate', null, null, 0),
  (1163, 1, 'Invite Vert Croise', '54 · P 52', null, 8000),
  (1163, 2, 'Chemise Cravate Blanc 2XL', null, null, 0),
  (1163, 3, 'Achv Marron Clair 42', null, null, 0),
  (1163, 4, 'Gravatte gris', null, null, 0),
  (1164, 1, 'Tuxedo C avec Gelly C', '50 · G 52 · P 52', '96.5 Cm', 0),
  (1164, 2, 'Chemise Papillon Blanc XL', null, null, 0),
  (1164, 3, 'Cordon Glacé Simple 41', null, null, 0)
on conflict (row_no, piece_no) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Création des commandes, puis de leurs pièces — même boucle que la
-- première reprise, limitée à ce qui n'est pas encore entré.
-- -----------------------------------------------------------------------------
do $import$
declare
  b        private.import_bookings%rowtype;
  p        private.import_booking_lines%rowtype;
  v_order  bigint;
  v_line   bigint;
  n_orders integer := 0;
  n_pieces integer := 0;
begin
  for b in
    select * from private.import_bookings
    where order_id is null and row_no > 1000
    order by row_no
  loop
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
  end loop;

  for p in
    select l.*
    from private.import_booking_lines l
    join private.import_bookings o on o.row_no = l.row_no
    where l.line_id is null and o.order_id is not null and l.row_no > 1000
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

  -- Rendues d'après le tableur : retour réel = retour prévu (voir en-tête).
  update public.orders o
  set actual_return_date = o.return_due_date
  from private.import_bookings ib
  where ib.order_id = o.id and ib.row_no > 1000
    and o.returned and o.actual_return_date is null;

  raise notice 'Reprise du 02/10 : % commandes, % pièces.', n_orders, n_pieces;
end
$import$;
