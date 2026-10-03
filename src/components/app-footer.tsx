import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import pkg from "../../package.json";
import wordmark from "../../public/logo-wordmark.png";

/**
 * Pied de page — GRANDS ÉCRANS UNIQUEMENT.
 *
 * Sur téléphone la barre d'onglets basse occupe déjà cette zone : y empiler un
 * pied de page volerait de la place au pouce.
 *
 * Surface `brown-soft` (#F1E9E1) et NON le brun des barres : un pied de page
 * clôt la page, il ne la commande pas. Un aplat sombre en bas de chaque écran
 * pesait autant que l'en-tête alors qu'il ne porte rien d'urgent. Contrastes
 * MESURÉS dessus (les deux modes) : encre 13,10:1, texte secondaire 5,72:1,
 * `gold-strong` 5,81:1. Le texte reste donc en `foreground` /
 * `muted-foreground` ordinaires — pas de jeu de tokens dédié.
 *
 * Contenu volontairement VRAI. Pas de « Mentions légales » ni de « Support » :
 * un lien mort fait plus de dégâts qu'une absence de lien.
 *
 * Ce qu'on N'Y MET PAS non plus : des chiffres du jour (retraits, retards,
 * impayés). Ils vivent sur le tableau de bord et la liste des commandes, en
 * haut de page. Une alerte qu'il faut faire défiler jusqu'en bas est une
 * alerte manquée — et elle coûterait une requête à CHAQUE page rendue.
 */
export async function AppFooter({ showOwnerLinks }: { showOwnerLinks: boolean }) {
  const t = await getTranslations();

  // Les mêmes destinations que la barre d'en-tête, PLUS les deux écrans de
  // création qui n'y tiennent pas. Toutes existent : voir `src/app/[locale]/(app)`.
  const links = [
    { href: "/commandes", label: t("nav.orders") },
    { href: "/commandes/nouvelle", label: t("orders.new") },
    { href: "/stock", label: t("nav.stock") },
    { href: "/stock/nouveau", label: t("stock.newModel") },
    ...(showOwnerLinks
      ? [
          { href: "/tableau-de-bord", label: t("nav.dashboard") },
          { href: "/depenses", label: t("nav.expenses") },
          { href: "/equipe", label: t("nav.team") },
          { href: "/boutique", label: t("nav.shop") },
        ]
      : []),
  ];

  // Les trois règles que le tableur ne disait nulle part, et qui expliquent ce
  // que l'application fait des dates et du stock. Formulées SANS chiffre : le
  // nombre de jours vient de `public.settings` et peut changer — une phrase
  // qui dit « la veille » deviendrait fausse sans prévenir.
  const tips = [t("footer.tipDates"), t("footer.tipCleaning"), t("footer.tipUnits")];

  return (
    <footer className="border-border bg-brown-soft mt-8 hidden border-t md:block">
      {/* Trois colonnes de hauteur comparable, en `text-xs` : c'est ce qui
          tient le pied de page sous ~120 px. Empilées, les mêmes informations
          en faisaient plus du double. */}
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-5 text-xs md:grid-cols-3">
        <div>
          {/* LE LOGO À LA PLACE DU NOM ÉCRIT — le mot du bon, en encre, tel
              quel : le pied de page est en `brown-soft` (#F1E9E1), un fond
              clair.
              Pas de `priority` : le pied de page est sous la ligne de
              flottaison, il se charge en différé — contrairement à celui de la
              barre.
              Le `alt` porte le nom : c'est la seule chose qui identifie encore
              cette colonne pour un lecteur d'écran. */}
          <Image src={wordmark} alt={t("app.name")} sizes="125px" className="h-6 w-auto" />
          <p className="text-muted-foreground mt-1.5">{t("app.tagline")}</p>
          <p className="text-muted-foreground mt-2">
            {/* L'année est calculée au rendu : le serveur rend cette page à la
                demande, elle ne se figera pas sur l'année du build. */}
            {/* Plus de nom dans la mention : le logo est juste au-dessus. Une
                mention de droits nomme d'ordinaire son titulaire — ici c'est
                le logo qui le fait, à 30 px de là. */}
            {t("footer.copyright", {
              // En CHAÎNE et non en nombre : passé en nombre, ICU le formaterait
              // comme un montant et le français afficherait « 2 026 ».
              year: String(new Date().getFullYear()),
            })}
            <span className="mx-1.5" aria-hidden>
              ·
            </span>
            <span className="tabular">{t("footer.version", { version: pkg.version })}</span>
          </p>
        </div>

        <nav aria-labelledby="footer-nav">
          <h2 id="footer-nav" className="text-foreground font-medium">
            {t("footer.navTitle")}
          </h2>
          {/* Liens au fil, pas en colonnes : six entrées empilées faisaient à
              elles seules la hauteur du pied de page. */}
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-muted-foreground hover:text-gold-strong transition-colors hover:underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="footer-tips">
          <h2 id="footer-tips" className="text-foreground font-medium">
            {t("footer.tipsTitle")}
          </h2>
          <ul className="text-muted-foreground mt-2 space-y-1">
            {tips.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
      </div>
    </footer>
  );
}
