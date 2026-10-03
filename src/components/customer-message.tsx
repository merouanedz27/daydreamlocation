"use client";

import { createContext, useContext } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { fillMessage, whatsappHref, type MessageOrder } from "@/lib/customer-message";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Le message type de la boutique, lu UNE fois par le layout protégé et
 * distribué ici : les listes (tableau, Demain, Pas rentrés, calendrier) n'ont
 * pas à le recharger ni à se le passer de composant en composant.
 */
const CustomerMessageContext = createContext<string>("");

export function CustomerMessageProvider({
  template,
  children,
}: {
  template: string;
  children: React.ReactNode;
}) {
  return <CustomerMessageContext value={template}>{children}</CustomerMessageContext>;
}

/**
 * 💬 : ouvre WhatsApp sur le numéro du client, le message type déjà rempli
 * avec SA commande. Rien ne part sans que l'employé appuie sur Envoyer.
 */
export function MessageButton({
  order,
  phone,
  className,
  children,
  ...rest
}: Omit<React.ComponentProps<"a">, "href"> & {
  order: MessageOrder;
  phone: string;
  className?: string;
  /** Contenu à la place de l'icône seule (bouton de la fiche). */
  children?: React.ReactNode;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const template = useContext(CustomerMessageContext);

  return (
    <a
      {...rest}
      href={whatsappHref(phone, template ? fillMessage(template, order, locale) : "")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("orders.messageNamed", { name: order.customer_name })}
      className={cn(
        !children &&
          "text-muted-foreground hover:text-foreground hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full",
        className,
      )}
    >
      {children ?? <MessageCircle className="size-5" aria-hidden />}
    </a>
  );
}
