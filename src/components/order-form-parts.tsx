"use client";

import { useTranslations } from "next-intl";
import { Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Les briques communes aux formulaires de commande — la saisie rapide
 * (location, mixte) et la vente seule au comptoir.
 */

/** Pas des boutons − / + des montants : les prix se comptent en 500 DA. */
const MONEY_STEP = 500;

/**
 * Un montant avec les boutons − / + de son AppSheet. Le pas est de 500 DA :
 * à 1 DA comme dans AppSheet, les boutons ne servaient à rien. Le clavier
 * numérique reste là pour un montant exact.
 */
export function MoneyStepper({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations();
  const current = Number(value) || 0;
  const step = (delta: number) =>
    onChange(String(Math.max(0, current + delta)));

  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        data-field
        type="number"
        inputMode="numeric"
        min={0}
        step={MONEY_STEP}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        enterKeyHint="next"
        className="tabular h-12 min-w-0 flex-1 text-base"
        aria-invalid={invalid || undefined}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0"
        onClick={() => step(-MONEY_STEP)}
        disabled={current <= 0}
        aria-label={t("orders.quick.stepDown", { step: MONEY_STEP })}
      >
        <Minus className="size-5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0"
        onClick={() => step(MONEY_STEP)}
        aria-label={t("orders.quick.stepUp", { step: MONEY_STEP })}
      >
        <Plus className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

/** Une case ✗ / ✓ de son formulaire AppSheet, en bouton à bascule de 48 px. */
export function FlagToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-lg border px-3 text-start text-sm transition-colors",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        checked
          ? "border-gold-strong bg-gold-soft font-medium"
          : "border-border bg-card hover:border-gold-strong",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md border",
          checked
            ? "bg-primary text-primary-foreground border-transparent"
            : "border-border bg-background text-muted-foreground",
        )}
        aria-hidden
      >
        {checked ? <Check className="size-4" /> : <X className="size-3.5" />}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function RequiredMark() {
  return (
    <span className="text-destructive ms-0.5" aria-hidden>
      *
    </span>
  );
}

/**
 * Couleur d'un bloc du formulaire de commande : le patron voulait savoir, en
 * faisant défiler, s'il est dans la retouche, le client, la tenue ou le
 * paiement. Fond PÂLE + filet épais côté début ; jamais le rouge ni le vert,
 * qui disent déjà « erreur » et « revenue ».
 */
const SECTION_TONES = {
  gold: "bg-gold-soft border-gold-strong",
  client: "bg-section-client border-section-client-edge",
  outfit: "bg-brown-soft border-secondary",
  payment: "bg-muted border-muted-foreground",
} as const;

export type SectionTone = keyof typeof SECTION_TONES;

/** Une section : filet en tête plutôt qu'une carte, pour garder la largeur. */
export function Section({
  id,
  title,
  aside,
  invalid,
  tone,
  children,
}: {
  id: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  invalid?: boolean;
  /** Avec une teinte, la section devient une carte colorée. */
  tone?: SectionTone;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-20 outline-none",
        tone
          ? cn(
              "mb-4 rounded-lg border-s-4 p-4",
              // Les champs shadcn sont transparents : sur la teinte, on les
              // veut BLANCS, comme les listes et les dates à côté.
              "[&_[data-slot=input]]:bg-background [&_[data-slot=textarea]]:bg-background",
              SECTION_TONES[tone],
            )
          : "border-border border-t pt-5 pb-6 first-of-type:border-t-0 first-of-type:pt-0",
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <h2
          id={`${id}-title`}
          className={cn("text-lg font-medium", invalid && "text-destructive")}
        >
          {title}
        </h2>
        {aside && <span className="ms-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
