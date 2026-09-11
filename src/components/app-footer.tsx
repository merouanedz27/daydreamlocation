import { getTranslations } from "next-intl/server";

/**
 * Pied de page — GRANDS ÉCRANS UNIQUEMENT.
 *
 * Sur téléphone la barre d'onglets basse occupe déjà cette zone : y empiler un
 * pied de page volerait de la place au pouce pour n'afficher qu'un rappel.
 *
 * Contenu volontairement pauvre et VRAI. Pas de « Mentions légales » ni de
 * « Support » : un lien mort fait plus de dégâts qu'une absence de lien, et
 * cette application n'a ni l'un ni l'autre.
 */
export async function AppFooter() {
  const t = await getTranslations();

  return (
    /* Même brun que les barres, mais OPAQUE : le pied de page ne surplombe
       rien, il n'y a pas de contenu à laisser transparaître dessous. */
    <footer className="border-nav-border bg-nav mt-8 hidden border-t md:block">
      <div className="text-nav-muted mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 text-sm">
        <p>
          <span className="text-nav-foreground font-medium">{t("app.name")}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          {t("app.tagline")}
        </p>

        {/* L'année est calculée au rendu : le serveur rend cette page à la
            demande, elle ne se figera pas sur l'année du build. */}
        <p className="tabular shrink-0">{new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
