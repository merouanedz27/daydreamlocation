"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CircleCheck, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/** Ce que le formulaire répond à un scan : affiché sous la caméra. */
export type ScanOutcome = { ok: boolean; message: string };

/**
 * Le même QR encore devant la caméra n'est pas une deuxième paire : on
 * l'ignore pendant ce délai, le temps de poser la boîte.
 */
const SAME_CODE_COOLDOWN_MS = 2500;

/** Au cas où le tiroir ne signale pas la fin de son ouverture (animations coupées). */
const SETTLE_FALLBACK_MS = 600;

/**
 * Paire acceptée : le cadre passe au vert, puis le tiroir se referme de
 * lui-même après ce délai — le temps de VOIR que le scan est pris.
 */
const CLOSE_AFTER_SCAN_MS = 450;

type CameraState = "starting" | "ready" | "denied" | "none";

/**
 * Le scanner du comptoir : la caméra arrière, qui lit les étiquettes QR des
 * paires à vendre (le QR contient la RÉFÉRENCE, « Gio-079-01 »).
 *
 * Une paire ACCEPTÉE referme le tiroir : l'employé revient au formulaire et
 * voit l'article ajouté à la liste (demande du client). Un scan REFUSÉ
 * (référence inconnue, déjà vendue…) le laisse ouvert, la raison sous
 * l'image, pour scanner aussitôt la bonne boîte. Étiquette abîmée ou caméra
 * refusée : la référence se tape à la main, même chemin.
 */
export function QrScanSheet({
  open,
  onOpenChange,
  onScan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (ref: string) => ScanOutcome;
}) {
  const t = useTranslations("orders.sale");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [typed, setTyped] = useState("");
  // La caméra démarre quand le tiroir a FINI de s'ouvrir : la vidéo est
  // alors à sa taille définitive.
  const [settled, setSettled] = useState(false);
  const [flash, setFlash] = useState(false);
  // Fermeture en cours après un scan accepté : on n'en prend pas d'autre.
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  // Lu par le rappel de la caméra, créé une fois : la dernière version du
  // formulaire, sans redémarrer la caméra à chaque scan.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(
    () => () => {
      if (closing.current) clearTimeout(closing.current);
    },
    [],
  );
  const last = useRef<{ code: string; at: number } | null>(null);

  function handle(code: string) {
    const ref = code.trim();
    if (!ref || closing.current) return;
    const result = onScanRef.current(ref);
    if (!result.ok) {
      setOutcome(result);
      return;
    }
    navigator.vibrate?.(60);
    setFlash(true);
    setOutcome(null);
    toast.success(result.message);
    closing.current = setTimeout(() => changeOpen(false), CLOSE_AFTER_SCAN_MS);
  }

  // La caméra, démarrée une fois, appelle toujours la dernière version.
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  });

  useEffect(() => {
    if (!open || settled) return;
    const timer = setTimeout(() => setSettled(true), SETTLE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [open, settled]);

  function changeOpen(next: boolean) {
    if (!next) {
      // La prochaine ouverture repart propre : pas d'ancien message, pas de
      // cadre vert, caméra relancée après l'animation.
      if (closing.current) clearTimeout(closing.current);
      closing.current = null;
      setSettled(false);
      setFlash(false);
      setOutcome(null);
    }
    onOpenChangeRef.current(next);
  }

  useEffect(() => {
    if (!open || !settled) return;
    let cancelled = false;
    let scanner: { stop(): void; destroy(): void } | null = null;
    void (async () => {
      const video = videoRef.current;
      if (!video || cancelled) return;
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled) return;
        if (!window.isSecureContext || !(await QrScanner.hasCamera())) {
          if (!cancelled) setCamera("none");
          return;
        }
        const instance = new QrScanner(
          video,
          (result) => {
            const now = Date.now();
            const prev = last.current;
            if (prev && prev.code === result.data && now - prev.at < SAME_CODE_COOLDOWN_MS) {
              return;
            }
            last.current = { code: result.data, at: now };
            handleRef.current(result.data);
          },
          {
            preferredCamera: "environment",
            maxScansPerSecond: 8,
            // Pas le cadre de la bibliothèque : il se recalcule sur la
            // position de la vidéo et sautait pendant que le tiroir glisse.
            // Le nôtre, fixe, est dessiné par-dessus (voir plus bas).
            returnDetailedScanResult: true,
          },
        );
        scanner = instance;
        await instance.start();
        if (cancelled) instance.destroy();
        else setCamera("ready");
      } catch {
        if (!cancelled) setCamera("denied");
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
      setCamera("starting");
    };
  }, [open, settled]);

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    handle(typed);
    setTyped("");
  }

  return (
    <Drawer
      open={open}
      onOpenChange={changeOpen}
      onAnimationEnd={(isOpen) => isOpen && setSettled(true)}
    >
      <DrawerContent className="h-[88svh] max-h-[88svh]">
        <DrawerHeader className="pb-2 text-start">
          <DrawerTitle className="text-lg">{t("scanTitle")}</DrawerTitle>
          <DrawerDescription>{t("scanHint")}</DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
          <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-lg">
            {/* JAMAIS cachée (ni `hidden`, ni `invisible`) : la bibliothèque
                prendrait une vidéo masquée pour voulue et la réduirait à
                0 × 0 — le scan marchait alors à l'aveugle. Le message de
                démarrage se pose PAR-DESSUS. */}
            <video
              ref={videoRef}
              muted
              playsInline
              className="block size-full object-cover"
            />
            {/* Le cadre de visée : ⅔ du carré, centré — la zone que la
                bibliothèque lit par défaut. Ce qui est dedans est lu. */}
            {camera === "ready" && (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-[16.67%] transition-colors",
                  flash ? "text-success" : "text-gold-strong",
                )}
              >
                <span className="absolute start-0 top-0 size-8 rounded-ss-lg border-s-4 border-t-4 border-current" />
                <span className="absolute end-0 top-0 size-8 rounded-se-lg border-e-4 border-t-4 border-current" />
                <span className="absolute start-0 bottom-0 size-8 rounded-es-lg border-s-4 border-b-4 border-current" />
                <span className="absolute end-0 bottom-0 size-8 rounded-ee-lg border-e-4 border-b-4 border-current" />
              </div>
            )}
            {camera !== "ready" && (
              <div className="bg-muted text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm">
                {camera === "starting" ? (
                  <ScanLine className="size-8 animate-pulse" aria-hidden />
                ) : (
                  <AlertTriangle className="size-8" aria-hidden />
                )}
                {camera === "starting"
                  ? t("cameraStarting")
                  : camera === "denied"
                    ? t("cameraDenied")
                    : t("noCamera")}
              </div>
            )}
          </div>

          <p
            role="status"
            aria-live="polite"
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium",
              !outcome && "invisible",
              outcome?.ok
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {outcome?.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1">{outcome?.message}</span>
          </p>

          {/* Étiquette abîmée, caméra refusée : la référence à la main. */}
          <form onSubmit={submitTyped} className="flex gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("typeRef")}
              aria-label={t("typeRef")}
              dir="ltr"
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="done"
              className="h-12 min-w-0 flex-1 text-base"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-12 px-4 text-base"
              disabled={!typed.trim()}
            >
              {t("addRef")}
            </Button>
          </form>
        </div>

        <DrawerFooter>
          <Button
            type="button"
            className="h-12 text-base"
            onClick={() => changeOpen(false)}
          >
            {t("done")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
