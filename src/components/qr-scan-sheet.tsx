"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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

type CameraState = "starting" | "ready" | "denied" | "none";

/**
 * Le scanner du comptoir : la caméra arrière, qui lit les étiquettes QR des
 * paires à vendre (le QR contient la RÉFÉRENCE, « Gio-079-01 »).
 *
 * Il reste ouvert : on scanne plusieurs paires d'affilée, chaque résultat
 * s'affiche sous l'image, « Terminé » referme. Étiquette abîmée ou caméra
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
  // Lu par le rappel de la caméra, créé une fois : la dernière version du
  // formulaire, sans redémarrer la caméra à chaque scan.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });
  const last = useRef<{ code: string; at: number } | null>(null);

  function handle(code: string) {
    const ref = code.trim();
    if (!ref) return;
    const result = onScanRef.current(ref);
    setOutcome(result);
    if (result.ok) navigator.vibrate?.(60);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let scanner: { stop(): void; destroy(): void } | null = null;
    // Le contenu du tiroir vient d'être monté : on attend une image pour que
    // la vidéo soit dans la page.
    const frame = requestAnimationFrame(async () => {
      const video = videoRef.current;
      if (!video || cancelled) return;
      setCamera("starting");
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
            handle(result.data);
          },
          {
            preferredCamera: "environment",
            maxScansPerSecond: 8,
            highlightScanRegion: true,
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
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      scanner?.stop();
      scanner?.destroy();
    };
  }, [open]);

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    handle(typed);
    setTyped("");
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[88svh] max-h-[88svh]">
        <DrawerHeader className="pb-2 text-start">
          <DrawerTitle className="text-lg">{t("scanTitle")}</DrawerTitle>
          <DrawerDescription>{t("scanHint")}</DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
          <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-lg">
            <video
              ref={videoRef}
              muted
              playsInline
              className={cn(
                "size-full object-cover",
                camera !== "ready" && "invisible",
              )}
            />
            {camera !== "ready" && (
              <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm">
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
            onClick={() => onOpenChange(false)}
          >
            {t("done")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
