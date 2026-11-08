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
 * Scan accepté : le cadre s'est posé sur le QR (200 ms), il passe au vert,
 * puis le tiroir se referme de lui-même après ce délai — le temps de VOIR
 * que le scan est pris.
 */
const CLOSE_AFTER_SCAN_MS = 650;

/** Le cadre de visée au repos : ⅔ du carré, centré (en % du carré). */
const REST_FRAME: Box = { left: 16.67, top: 16.67, width: 66.67, height: 66.67 };

/** Durée du resserrement du cadre sur le QR — la même que sa transition CSS. */
const LOCK_MS = 200;

/** Marge autour du QR quand le cadre s'y pose, en fraction de sa taille. */
const LOCK_MARGIN = 0.1;

type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

/**
 * Les coins du QR (pixels de la VIDÉO) → une boîte en % du carré affiché.
 *
 * La vidéo est en `object-cover` dans un carré : elle est agrandie puis
 * rognée au centre. On refait le même calcul pour savoir où le QR tombe à
 * l'écran. Coordonnées PHYSIQUES (gauche / haut) : l'image d'une caméra ne
 * se retourne pas en arabe.
 */
function lockBox(video: HTMLVideoElement, corners: Point[]): Box | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch || corners.length < 3) return null;
  const scale = Math.max(cw / vw, ch / vh);
  const dx = (cw - vw * scale) / 2;
  const dy = (ch - vh * scale) / 2;
  // Caméra AVANT (webcam d'un ordinateur) : la bibliothèque retourne la vidéo
  // en miroir (`scaleX(-1)`) — le QR apparaît de l'autre côté. La caméra
  // arrière d'un téléphone, elle, n'est pas retournée.
  const mirrored = /scaleX\(-1\)/.test(video.style.transform);
  const xs = corners.map((p) => {
    const x = p.x * scale + dx;
    return mirrored ? cw - x : x;
  });
  const ys = corners.map((p) => p.y * scale + dy);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const left = Math.max(0, minX - w * LOCK_MARGIN);
  const top = Math.max(0, minY - h * LOCK_MARGIN);
  const right = Math.min(cw, minX + w * (1 + LOCK_MARGIN));
  const bottom = Math.min(ch, minY + h * (1 + LOCK_MARGIN));
  if (right - left < 8 || bottom - top < 8) return null;
  return {
    left: (left / cw) * 100,
    top: (top / ch) * 100,
    width: ((right - left) / cw) * 100,
    height: ((bottom - top) / ch) * 100,
  };
}

type CameraState = "starting" | "ready" | "denied" | "none";

/**
 * Le scanner du comptoir : la caméra arrière, qui lit les étiquettes QR des
 * paires à vendre (le QR contient la RÉFÉRENCE, « Gio-079-01 »).
 *
 * Un QR DÉTECTÉ : le cadre de visée se resserre sur lui (il « accroche »),
 * passe au vert s'il est accepté, et le tiroir se referme — l'employé revient
 * à l'écran et voit le résultat (demande du client). Un scan REFUSÉ
 * (référence inconnue, déjà vendue…) le laisse ouvert, la raison sous
 * l'image, pour scanner aussitôt la bonne boîte. Étiquette abîmée ou caméra
 * refusée : la référence se tape à la main, même chemin.
 */
export function QrScanSheet({
  open,
  onOpenChange,
  onScan,
  manualEntry = true,
  texts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Synchrone (la vente, catalogue en mémoire) ou asynchrone (l'atelier, serveur). */
  onScan: (ref: string) => ScanOutcome | Promise<ScanOutcome>;
  /** `false` : pas de saisie à la main (un identifiant d'étiquette ne se tape pas). */
  manualEntry?: boolean;
  /** Titre et aide du tiroir, à la place de ceux de la vente. */
  texts?: { title: string; hint: string };
}) {
  const t = useTranslations("orders.sale");
  // Un scan en cours d'envoi au serveur : on n'en prend pas un autre.
  const pending = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [typed, setTyped] = useState("");
  // La caméra démarre quand le tiroir a FINI de s'ouvrir : la vidéo est
  // alors à sa taille définitive.
  const [settled, setSettled] = useState(false);
  const [flash, setFlash] = useState(false);
  // Le cadre posé sur le QR détecté ; `null` = au repos, au centre.
  const [lock, setLock] = useState<Box | null>(null);
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

  async function handle(code: string, corners?: Point[]) {
    const ref = code.trim();
    if (!ref || closing.current || pending.current) return;
    pending.current = true;
    // Le cadre accroche le QR AVANT la réponse : pendant que l'atelier
    // interroge le serveur, il reste posé dessus, en or.
    const video = videoRef.current;
    const box = corners && video ? lockBox(video, corners) : null;
    const lockedAt = performance.now();
    if (box) setLock(box);
    let result: ScanOutcome;
    try {
      result = await onScanRef.current(ref);
    } finally {
      pending.current = false;
    }
    if (!result.ok) {
      // Refusé : le cadre a le temps de se poser (« vu »), puis revient au
      // centre ; la raison s'affiche dessous, le tiroir reste ouvert.
      setOutcome(result);
      setFlash(false);
      const hold = box ? LOCK_MS + 250 - (performance.now() - lockedAt) : 0;
      if (hold > 0) await new Promise((resolve) => setTimeout(resolve, hold));
      setLock(null);
      return;
    }
    // D'abord le cadre finit de se poser, PUIS il passe au vert : la vente
    // répond tout de suite, sans cette attente les deux se confondraient.
    const wait = box ? LOCK_MS - (performance.now() - lockedAt) : 0;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
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
      // Caméra relancée après l'animation de la prochaine ouverture. Le cadre
      // et le message, eux, se remettent à zéro tiroir FERMÉ (`onAnimationEnd`)
      // — ou, animations coupées, après ce même délai de secours.
      if (closing.current) clearTimeout(closing.current);
      closing.current = null;
      setSettled(false);
      setTimeout(() => onAnimationEnd(false), SETTLE_FALLBACK_MS);
    }
    onOpenChangeRef.current(next);
  }

  /**
   * Le cadre vert reste posé sur le QR pendant que le tiroir descend : il ne
   * revient au centre qu'une fois le tiroir FERMÉ. La prochaine ouverture
   * repart propre : pas d'ancien message, pas de cadre vert.
   */
  function onAnimationEnd(isOpen: boolean) {
    if (isOpen) {
      setSettled(true);
      return;
    }
    setFlash(false);
    setLock(null);
    setOutcome(null);
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
            void handleRef.current(result.data, result.cornerPoints);
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
    // Portail : sans cela, la soumission remonte au <form> de la vente.
    event.stopPropagation();
    void handle(typed);
    setTyped("");
  }

  return (
    <Drawer
      open={open}
      onOpenChange={changeOpen}
      onAnimationEnd={onAnimationEnd}
    >
      <DrawerContent className="h-[88svh] max-h-[88svh]">
        <DrawerHeader className="pb-2 text-start">
          <DrawerTitle className="text-lg">{texts?.title ?? t("scanTitle")}</DrawerTitle>
          <DrawerDescription>{texts?.hint ?? t("scanHint")}</DrawerDescription>
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
            {/* Le cadre de visée : au repos ⅔ du carré, centré — la zone que
                la bibliothèque lit par défaut. Un QR détecté : il se resserre
                sur lui (`lock`), puis passe au vert.
                Position en `left/top/width/height` TOUJOURS, jamais `inset-*` :
                passer de l'un à l'autre ne s'anime pas, et en arabe `left`
                serait ignoré. Physique et non logique : c'est l'image de la
                caméra, elle ne se retourne pas. */}
            {camera === "ready" && (
              <div
                aria-hidden
                style={(() => {
                  const box = lock ?? REST_FRAME;
                  return {
                    left: `${box.left}%`,
                    top: `${box.top}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  };
                })()}
                className={cn(
                  "pointer-events-none absolute transition-[left,top,width,height,color] duration-200 ease-out motion-reduce:transition-none",
                  flash ? "text-success" : "text-gold-strong",
                )}
              >
                {(["ss", "se", "es", "ee"] as const).map((corner) => (
                  <span
                    key={corner}
                    className={cn(
                      "absolute border-current transition-[width,height] duration-200 ease-out motion-reduce:transition-none",
                      lock ? "size-5" : "size-8",
                      corner === "ss" && "start-0 top-0 rounded-ss-lg border-s-4 border-t-4",
                      corner === "se" && "end-0 top-0 rounded-se-lg border-e-4 border-t-4",
                      corner === "es" && "start-0 bottom-0 rounded-es-lg border-s-4 border-b-4",
                      corner === "ee" && "end-0 bottom-0 rounded-ee-lg border-e-4 border-b-4",
                    )}
                  />
                ))}
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
          {manualEntry && (
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
          )}
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
