"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { photoUrl, PHOTO_BUCKET } from "@/lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // aligné sur la limite du bucket
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Photo d'un modèle.
 *
 * Le fichier part DIRECTEMENT du navigateur vers Supabase Storage, et le
 * formulaire ne transporte ensuite que le chemin. Faire transiter l'image par
 * une Server Action se heurterait à la limite de taille du corps de requête, et
 * ferait remonter plusieurs mégaoctets jusqu'au serveur Next avant de
 * redescendre vers le stockage — deux fois le trajet, sur une connexion de
 * téléphone.
 *
 * `capture="environment"` ouvre l'appareil photo arrière sur mobile : c'est le
 * geste attendu quand on photographie un costume sur un cintre.
 */
export function PhotoUpload({
  name = "photo_path",
  defaultPath = null,
}: {
  name?: string;
  defaultPath?: string | null;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(defaultPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("errors.photoType");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("errors.photoTooBig");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      // Nom aléatoire : deux téléphones peuvent envoyer « IMG_0001.jpg ».
      const key = `${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(key, file, { cacheControl: "31536000", upsert: false });

      if (uploadError) {
        setError("errors.photoUpload");
        return;
      }
      setPath(key);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Le chemin est la seule chose que le formulaire envoie au serveur. */}
      <input type="hidden" name={name} value={path ?? ""} />

      <div className="flex items-center gap-3">
        <div className="bg-muted border-border relative size-20 shrink-0 overflow-hidden rounded-md border">
          {path ? (
            <Image src={photoUrl(path)} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center">
              <Camera className="size-6" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="min-h-11"
          >
            {busy ? <Spinner /> : <Camera className="size-4" aria-hidden />}
            {t("stock.photo")}
          </Button>

          {path && !busy && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPath(null)}
              className="min-h-11"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-destructive mt-2 text-sm">{t(error)}</p>}
    </div>
  );
}
