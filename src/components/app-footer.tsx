import { getTranslations } from "next-intl/server";
import { CalendarDays, Shirt, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import pkg from "../../package.json";

/**
 * Pied de page — GRANDS ÉCRANS UNIQUEMENT.
 *
 * Sur téléphone la barre d'onglets basse occupe déjà cette zone : y empiler un
 * pied de page volerait de la place au pouce.
 *
 * Contenu volontairement VRAI. Pas de « Mentions légales » ni de « Support » :
 * un lien mort fait plus de dégâts qu'une absence de lien, et cette
 * application n'a ni l'un ni l'autre.
 *
 * Ce qu'on N'Y MET PAS non plus : des chiffres du jour (retraits, retards,
 * impayés). Ils vivent sur le tableau de bord et la liste des commandes, en
 * haut de page. Une alerte qu'il faut faire défiler jusqu'en bas pour voir est
 * une alerte manquée — et elle coûterait une requête à CHAQUE page rendue.
 * Un pied de page porte ce qu'on vient chercher, pas ce qui doit vous trouver.
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
        ]
      : []),
  ];

  // Les trois règles que le tableur ne disait nulle part, et qui expliquent ce
  // que l'application fait des dates et du stock. Formulées SANS chiffre : le
  // nombre de jours vient de `public.settings` et peut changer — une phrase
  // qui dit « la veille » deviendrait fausse sans prévenir.
  const tips = [
    { icon: CalendarDays, text: t("footer.tipDates") },
    { icon: Sparkles, text: t("footer.tipCleaning") },
    { icon: Shirt, text: t("footer.tipUnits") },
  ];

  return (
    /* Même brun que les barres, mais OPAQUE : le pied de page ne surplombe
       rien, il n'y a pas de contenu à laisser transparaître dessous. */
    <footer className="border-nav-border bg-nav mt-8 hidden border-t md:block">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="font-heading text-nav-foreground text-base">{t("app.name")}</p>
            <p className="text-nav-muted mt-1 text-sm">{t("app.tagline")}</p>
          </div>

          <nav aria-labelledby="footer-nav">
            <h2 id="footer-nav" className="text-nav-foreground text-sm font-medium">
              {t("footer.navTitle")}
            </h2>
            {/* Deux colonnes de liens : six entrées empilées feraient une
                colonne deux fois plus haute que ses voisines. */}
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {links.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-nav-muted hover:text-nav-foreground inline-flex min-h-7 items-center transition-colors hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="footer-tips">
            <h2 id="footer-tips" className="text-nav-foreground text-sm font-medium">
              {t("footer.tipsTitle")}
            </h2>
            <ul className="text-nav-muted mt-3 space-y-2 text-sm">
              {tips.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="border-nav-border text-nav-muted mt-8 flex items-center justify-between gap-4 border-t pt-4 text-xs">
          {/* L'année est calculée au rendu : le serveur rend cette page à la
              demande, elle ne se figera pas sur l'année du build. */}
          <p>{t("footer.copyright", {
            // En CHAÎNE et non en nombre : passé en nombre, ICU le formaterait
            // comme un montant et le français afficherait « 2 026 ».
            year: String(new Date().getFullYear()),
            name: t("app.name"),
          })}</p>
          {/* Utile le jour où quelqu'un signale un défaut : on saura de quelle
              version il parle. Lue dans package.json, donc jamais désynchronisée. */}
          <p className="tabular shrink-0">{t("footer.version", { version: pkg.version })}</p>
        </div>
      </div>
    </footer>
  );
}
