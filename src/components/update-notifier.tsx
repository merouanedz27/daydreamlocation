"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

/** La version que CE téléphone a chargée, figée au build (`next.config.ts`). */
const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;

/** Vérification régulière tant que l'application est à l'écran. */
const CHECK_EVERY_MS = 10 * 60 * 1000;
/** Jamais plus d'une vérification par minute (retours rapides à l'appli). */
const MIN_GAP_MS = 60 * 1000;

/**
 * « Nouvelle version disponible — Actualiser ».
 *
 * L'application installée reste ouverte des jours : après une mise en ligne,
 * le téléphone garde l'ANCIEN code. L'équipe ne voit pas les nouveautés, et
 * pire, Next renomme les Server Actions à chaque build — l'ancienne page qui
 * enregistre une commande échouerait (« Failed to find Server Action »).
 *
 * Jamais de rechargement automatique : l'employé peut être au téléphone avec
 * un client. Une barre, un bouton. Recharger ne perd rien : la saisie d'une
 * commande est gardée dans le téléphone à chaque frappe.
 */
export function UpdateNotifier() {
  const t = useTranslations("update");
  const [available, setAvailable] = useState(false);
  const [reloading, setReloading] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!LOADED_BUILD) return;
    let stopped = false;

    async function check(force = false) {
      const now = Date.now();
      if (!force && now - lastCheck.current < MIN_GAP_MS) return;
      lastCheck.current = now;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build: string | null };
        if (!stopped && build && build !== LOADED_BUILD) setAvailable(true);
      } catch {
        // Hors ligne : on réessaiera au prochain retour à l'application.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }

    // Filet de sécurité : une ancienne page vient d'appeler une action qui
    // n'existe plus sur le serveur — la mise à jour est là, sans attendre.
    function onError(reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      if (message.includes("Failed to find Server Action")) setAvailable(true);
    }
    const onRejection = (e: PromiseRejectionEvent) => onError(e.reason);
    const onWindowError = (e: ErrorEvent) => onError(e.error ?? e.message);

    void check(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onWindowError);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

  async function reload() {
    setReloading(true);
    try {
      // Le service worker (`skipWaiting`) prend la nouvelle version tout seul ;
      // on lui demande seulement de regarder tout de suite.
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // Sans service worker, le rechargement suffit.
    }
    window.location.reload();
  }

  if (!available) return null;

  return (
    // Au-dessus du bouton « + » et de la barre basse sur téléphone ; en bas à
    // droite (à gauche en arabe) sur ordinateur.
    <div
      role="status"
      className="bg-nav text-nav-foreground border-nav-border fixed inset-x-3 bottom-[calc(8.75rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-xl border py-1.5 ps-3 pe-1 shadow-lg md:inset-x-auto md:end-4 md:bottom-4 md:max-w-sm"
    >
      <RefreshCw className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium">{t("available")}</p>
      <button
        type="button"
        onClick={reload}
        disabled={reloading}
        className="bg-primary text-primary-foreground flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-80"
      >
        {reloading && <Spinner className="size-4" />}
        {reloading ? t("reloading") : t("reload")}
      </button>
      <button
        type="button"
        onClick={() => setAvailable(false)}
        aria-label={t("later")}
        className="text-nav-muted hover:text-nav-foreground flex size-11 shrink-0 items-center justify-center rounded-lg"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
