"use client";

import { useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { updateEmailTexts } from "@/lib/actions/settings";
import {
  EMAIL_FIELDS,
  EMAIL_KINDS,
  EMAIL_LOCALES,
  INTRO_MAX,
  SUBJECT_MAX,
  fillTemplate,
  type EmailKind,
  type EmailLocale,
  type EmailText,
  type EmailTexts,
} from "@/lib/notification-settings";
import type { Locale } from "@/i18n/routing";

/** Par e-mail et par langue : le texte par défaut (écrit avec les champs) et des valeurs d'exemple. */
export type EmailDefaults = Record<EmailKind, Record<EmailLocale, EmailText>>;
export type EmailSamples = Record<EmailKind, Record<EmailLocale, Record<string, string>>>;

/**
 * Objet et introduction des deux e-mails automatiques, en français ET en
 * arabe — chaque administrateur reçoit l'e-mail dans SA langue. Vide = le
 * texte par défaut, affiché en gris dans le champ.
 */
export function EmailTextsForm({
  initial,
  defaults,
  samples,
}: {
  initial: EmailTexts;
  defaults: EmailDefaults;
  samples: EmailSamples;
}) {
  const t = useTranslations("settings.emails");
  return (
    <section className="mt-8">
      <h2 className="text-base font-medium">{t("textsTitle")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{t("textsHint")}</p>
      <div className="mt-4 space-y-6">
        {EMAIL_KINDS.map((kind) => (
          <EmailTextCard
            key={kind}
            kind={kind}
            initial={initial[kind]}
            defaults={defaults[kind]}
            samples={samples[kind]}
          />
        ))}
      </div>
    </section>
  );
}

type FieldKey = `${EmailLocale}.${keyof EmailText}`;

function EmailTextCard({
  kind,
  initial,
  defaults,
  samples,
}: {
  kind: EmailKind;
  initial: Record<EmailLocale, EmailText>;
  defaults: Record<EmailLocale, EmailText>;
  samples: Record<EmailLocale, Record<string, string>>;
}) {
  const t = useTranslations("settings.emails");
  const tAll = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [texts, setTexts] = useState(initial);
  // Une langue à la fois : la carte reste courte sur téléphone.
  const [lang, setLang] = useState<EmailLocale>(locale === "ar" ? "ar" : "fr");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Le dernier champ touché : c'est là que la pastille insère son champ.
  const focused = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(
    null,
  );

  function set(key: FieldKey, value: string) {
    const [lang, part] = key.split(".") as [EmailLocale, keyof EmailText];
    setTexts((current) => ({ ...current, [lang]: { ...current[lang], [part]: value } }));
  }

  function insert(token: string) {
    const target = focused.current;
    if (!target) return;
    const { el, key } = target;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const value = `${el.value.slice(0, start)}{${token}}${el.value.slice(end)}`;
    set(key, value);
    // Le curseur se replace après le champ inséré, une fois React passé.
    requestAnimationFrame(() => {
      el.focus();
      const at = start + token.length + 2;
      el.setSelectionRange(at, at);
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateEmailTexts({ locale, kind, ...texts });
      if (result.ok) {
        toast.success(t("saved"));
        return;
      }
      setError({ field: result.field ?? "", message: result.error });
      // L'erreur peut viser l'autre langue : on l'affiche.
      const errorLang = result.field?.split(".")[0];
      if (errorLang === "fr" || errorLang === "ar") setLang(errorLang);
      if (!result.field) toast.error(tAll(result.error));
    });
  }

  function remember(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    focused.current = { key: e.currentTarget.dataset.field as FieldKey, el: e.currentTarget };
  }

  const dir = lang === "ar" ? "rtl" : "ltr";
  const subjectKey = `${lang}.subject` as const;
  const introKey = `${lang}.intro` as const;
  const preview = {
    subject: fillTemplate(texts[lang].subject || defaults[lang].subject, samples[lang]),
    intro: fillTemplate(texts[lang].intro || defaults[lang].intro, samples[lang]),
  };

  return (
    <div className="border-border bg-card rounded-lg border p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t(`${kind}.title`)}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">{t(`${kind}.hint`)}</p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={lang}
          onValueChange={(v) => v && setLang(v as EmailLocale)}
          aria-label={t("language")}
          className="shrink-0"
        >
          {EMAIL_LOCALES.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={t(value === "fr" ? "langFr" : "langAr")}
              className="h-9 px-3"
            >
              {value === "fr" ? "FR" : "ع"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <FieldGroup className="mt-4">
        <Field data-invalid={error?.field === subjectKey || undefined}>
          <FieldLabel htmlFor={`${kind}-subject`}>
            {t("subject")} · {t(lang === "fr" ? "langFr" : "langAr")}
          </FieldLabel>
          <Input
            key={subjectKey}
            id={`${kind}-subject`}
            dir={dir}
            lang={lang}
            maxLength={SUBJECT_MAX}
            value={texts[lang].subject}
            placeholder={defaults[lang].subject}
            onChange={(e) => set(subjectKey, e.target.value)}
            data-field={subjectKey}
            onFocus={remember}
            className="h-12 text-base"
          />
          {error?.field === subjectKey && <FieldError>{tAll(error.message)}</FieldError>}
        </Field>
        <Field data-invalid={error?.field === introKey || undefined}>
          <FieldLabel htmlFor={`${kind}-intro`}>
            {t("intro")} · {t(lang === "fr" ? "langFr" : "langAr")}
          </FieldLabel>
          <Textarea
            key={introKey}
            id={`${kind}-intro`}
            dir={dir}
            lang={lang}
            rows={2}
            maxLength={INTRO_MAX}
            value={texts[lang].intro}
            placeholder={defaults[lang].intro}
            onChange={(e) => set(introKey, e.target.value)}
            data-field={introKey}
            onFocus={remember}
            className="text-base"
          />
          {error?.field === introKey && <FieldError>{tAll(error.message)}</FieldError>}
        </Field>
      </FieldGroup>

      <div className="mt-3">
        <p className="text-muted-foreground text-xs">{t("fieldsHint")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EMAIL_FIELDS[kind].map((token) => (
            <Button
              key={token}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full"
              // Garder le focus dans le champ : sinon la position du curseur est perdue.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(token)}
            >
              <span dir="ltr" className="font-mono text-xs">{`{${token}}`}</span>
              <span className="text-muted-foreground text-xs">{t(`fields.${token}`)}</span>
            </Button>
          ))}
        </div>
      </div>

      <div dir={dir} lang={lang} className="bg-muted/60 mt-4 rounded-md px-3 py-2 text-sm">
        <p className="text-muted-foreground text-xs">{t("preview")}</p>
        <p className="mt-1 font-medium break-words">{preview.subject}</p>
        {preview.intro && <p className="mt-1 break-words">{preview.intro}</p>}
      </div>

      <Button type="button" onClick={save} disabled={pending} className="mt-4 h-11 w-full sm:w-auto">
        {pending && <Spinner />}
        {t("save")}
      </Button>
    </div>
  );
}
