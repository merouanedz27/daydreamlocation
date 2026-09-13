"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Banknote, Check, Undo2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { addOrderPayment, setCautionReturned } from "@/lib/actions/orders";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Encaisser un versement — le geste du retour.
 *
 * « Le client rend le costume et donne le reste. » C'est ce moment-là qui
 * n'existait nulle part : `amount_paid` ne s'écrivait qu'à la création, donc
 * le reste dû affiché était figé au jour de la réservation et les impayés du
 * tableau de bord comptaient de l'argent déjà rentré.
 *
 * ON SAISIT CE QUE LE CLIENT TEND, PAS UN NOUVEAU TOTAL. Le champ est
 * pré-rempli avec le reste dû, parce que « il paie tout le reste » est le cas
 * de loin le plus fréquent — un seul appui suffit alors. L'addition, elle, est
 * faite par la base : deux téléphones qui encaissent au même instant
 * s'additionnent au lieu de s'écraser.
 *
 * LA CORRECTION EST DANS LE MÊME TIROIR, et c'est délibéré. Un champ d'argent
 * sans marche arrière est un piège : « 50000 » tapé pour « 5000 » resterait
 * faux pour toujours, et fausserait le reste dû jusqu'au tableau de bord.
 */
export function OrderPaymentDrawer({
  orderId,
  balance,
  amountPaid,
}: {
  orderId: number;
  /** Reste dû. Négatif = trop-perçu, à rendre au client. */
  balance: number;
  amountPaid: number;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"payment" | "refund">("payment");
  const [amount, setAmount] = useState("");

  const due = Math.max(balance, 0);

  function openWith(mode: "payment" | "refund") {
    setError(null);
    setDirection(mode);
    // Pré-remplissage du seul cas évident : il solde. Une correction, elle, ne
    // se devine pas — le champ reste vide pour forcer à la taper.
    setAmount(mode === "payment" && due > 0 ? String(due) : "");
    setOpen(true);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addOrderPayment(formData);
      if (result.ok) {
        setOpen(false);
        setAmount("");
        return;
      }
      setError(result.error);
    });
  }

  // Aperçu du résultat AVANT d'appuyer. C'est la seule protection contre le
  // zéro de trop sur un champ d'argent : le nouveau reste dû saute aux yeux.
  const typed = Number(amount);
  const valid = Number.isFinite(typed) && typed > 0;
  const delta = valid ? (direction === "refund" ? -typed : typed) : 0;
  const nextBalance = balance - delta;
  const nextPaid = amountPaid + delta;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => openWith("payment")}
          className={cn("h-11", due > 0 ? "flex-1" : "flex-1 sm:flex-none")}
          variant={due > 0 ? "default" : "outline"}
        >
          <Banknote className="size-4" aria-hidden />
          {due > 0 ? t("orders.collectBalance") : t("orders.addPayment")}
        </Button>

        {/* La correction n'apparaît que s'il y a quelque chose à corriger :
            sur une commande jamais encaissée, elle n'aurait aucun sens. */}
        {amountPaid > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => openWith("refund")}
            className="text-muted-foreground h-11"
          >
            <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("orders.correctPayment")}
          </Button>
        )}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>
              {direction === "refund"
                ? t("orders.correctPayment")
                : t("orders.addPayment")}
            </DrawerTitle>
            <DrawerDescription>
              {direction === "refund"
                ? t("orders.correctPaymentHint")
                : t("orders.addPaymentHint")}
            </DrawerDescription>
          </DrawerHeader>

          <form action={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={orderId} />
            <input type="hidden" name="direction" value={direction} />

            <div className="flex-1 overflow-y-auto px-4">
              <Field>
                <FieldLabel htmlFor="amount">
                  {direction === "refund"
                    ? t("orders.amountToRemove")
                    : t("orders.amountReceived")}
                </FieldLabel>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  required
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isPending}
                  className="tabular h-14 text-lg"
                />
              </Field>

              {/* Ce que la commande vaudra APRÈS. Deux lignes, pas un tableau :
                  le versement cumulé et le reste sont exactement les deux
                  chiffres que l'employé va relire au client. */}
              <dl className="border-border bg-muted/40 mt-4 space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{t("orders.paid")}</dt>
                  <dd className="tabular">{formatMoney(nextPaid, locale)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {nextBalance < 0 ? t("orders.toRefund") : t("orders.balance")}
                  </dt>
                  <dd
                    className={cn(
                      "tabular font-medium",
                      nextBalance > 0 && "text-warning-foreground",
                      nextBalance === 0 && "text-success",
                    )}
                  >
                    {nextBalance === 0
                      ? t("orders.settled")
                      : formatMoney(Math.abs(nextBalance), locale)}
                  </dd>
                </div>
              </dl>

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle />
                  <AlertDescription>{t(error)}</AlertDescription>
                </Alert>
              )}
            </div>

            <DrawerFooter>
              <Button
                type="submit"
                disabled={isPending || !valid}
                className="h-12 w-full text-base"
                variant={direction === "refund" ? "secondary" : "default"}
              >
                {isPending && <Spinner />}
                {direction === "refund" ? t("orders.correctPayment") : t("orders.collect")}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" className="h-12 w-full text-base">
                  {t("common.cancel")}
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * Caution rendue — le second geste du retour.
 *
 * La ligne « Caution rendue » s'affichait depuis le premier jour sans que rien
 * ne puisse l'écrire : une information en lecture seule que personne ne
 * pouvait rendre vraie. Un seul appui, pas de confirmation — le geste se
 * défait d'un second appui.
 */
export function CautionToggle({
  orderId,
  returned,
}: {
  orderId: number;
  returned: boolean;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    const data = new FormData();
    data.set("id", String(orderId));
    data.set("locale", locale);
    data.set("value", returned ? "0" : "1");
    startTransition(async () => {
      const result = await setCautionReturned(data);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mt-3">
      <Button
        type="button"
        variant={returned ? "ghost" : "outline"}
        disabled={isPending}
        onClick={toggle}
        className={cn("h-11 w-full justify-start", returned && "text-muted-foreground")}
      >
        {isPending ? (
          <Spinner />
        ) : (
          <Check className={cn("size-4", returned ? "text-success" : "text-muted-foreground")} aria-hidden />
        )}
        {returned ? t("orders.cautionTakeBack") : t("orders.cautionGiveBack")}
      </Button>

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle />
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
