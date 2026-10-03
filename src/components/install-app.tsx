"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * « Installer l'application » — pour que l'équipe ouvre Daydream Location d'une icône,
 * sans chercher le menu ⋮ de Chrome ni la feuille Partager de Safari.
 *
 * Deux mécanismes, un seul bouton :
 * - **Android / Chrome** : le navigateur émet `beforeinstallprompt`. On garde
 *   l'événement ; le bouton appelle `prompt()`. Sans événement (navigateur qui
 *   ne l'émet pas, ou application déjà installée), le bouton n'apparaît pas.
 * - **iPhone / iPad** : aucune API d'installation. Le bouton ouvre un tiroir
 *   qui montre les deux gestes de Safari.
 *
 * Déjà installée (ouverte depuis l'écran d'accueil) : rien ne s'affiche.
 *
 * L'écoute est posée AU CHARGEMENT DU MODULE et non dans un effet : Chrome
 * émet l'événement tôt, parfois avant l'hydratation — un `useEffect` le
 * manquerait.
 */

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Pas de mini-bannière du navigateur : c'est notre bouton qui propose.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type InstallMode = "prompt" | "ios" | null;

function currentMode(): InstallMode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  if (deferred) return "prompt";
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : null;
}

/**
 * `available` est faux au rendu serveur : le bouton n'apparaît qu'après
 * l'hydratation, sans écart entre le HTML serveur et le client.
 */
export function useInstallApp() {
  const mode = useSyncExternalStore(subscribe, currentMode, () => null);
  const [helpOpen, setHelpOpen] = useState(false);

  const install = useCallback(async () => {
    if (mode === "ios") {
      setHelpOpen(true);
      return;
    }
    const event = deferred;
    if (!event) return;
    // Un événement ne sert qu'une fois, accepté ou refusé.
    deferred = null;
    notify();
    await event.prompt();
  }, [mode]);

  return { available: mode !== null, install, helpOpen, setHelpOpen };
}

/** Les deux gestes de Safari. Rendu HORS des menus : ils se démontent en se fermant. */
export function InstallHelpDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  const steps = [
    { icon: Share, text: t("install.iosStep1") },
    { icon: SquarePlus, text: t("install.iosStep2") },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("install.iosTitle")}</DrawerTitle>
          <DrawerDescription>{t("install.iosIntro")}</DrawerDescription>
        </DrawerHeader>

        <ol className="flex flex-col gap-3 px-4">
          {steps.map(({ icon: Icon, text }, index) => (
            <li
              key={index}
              className="border-border flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2"
            >
              <span
                className="bg-gold-soft text-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm">{text}</span>
              <Icon className="text-gold-strong size-5 shrink-0" aria-hidden />
            </li>
          ))}
        </ol>

        <DrawerFooter className="pb-safe">
          <DrawerClose asChild>
            <Button variant="outline" className="h-12 text-base">
              {t("common.close")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
