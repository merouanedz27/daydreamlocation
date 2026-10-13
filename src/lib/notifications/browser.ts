import { removePushSubscription } from "@/lib/actions/notifications";

/**
 * Web Push côté navigateur — rien ici ne s'exécute sur le serveur.
 *
 * En développement, Serwist n'enregistre pas de service worker : le push
 * n'est testable qu'avec `npm run build && npm start`.
 */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Le service worker actif. Sans délai, on attend qu'il le soit : sur une
 * adresse neuve (nouveau déploiement, tunnel), il s'installe d'abord — 80
 * fichiers à télécharger, souvent plus de 5 s sur un téléphone. Abandonner
 * trop tôt affichait « non disponible » alors que tout allait bien.
 * Avec `timeoutMs`, renvoie `null` si le délai expire.
 */
export async function getPushRegistration(
  timeoutMs?: number,
): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV === "development" || !pushSupported()) return null;
  if (timeoutMs === undefined) return navigator.serviceWorker.ready;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/** Les champs que le serveur enregistre, tels que le navigateur les fournit (base64url). */
export function subscriptionFields(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    user_agent: navigator.userAgent.slice(0, 500),
  };
}

export function decodeKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer as ArrayBuffer;
}

/**
 * À la déconnexion : cet appareil cesse de recevoir les alertes du compte qui
 * s'en va. Sans cela, sur un téléphone partagé, le collègue suivant recevrait
 * les push du précédent. Ne lève jamais : la déconnexion doit aboutir.
 */
export async function detachPush(): Promise<void> {
  try {
    if (!pushSupported()) return;
    // `getRegistration` répond tout de suite, même sans service worker :
    // la déconnexion n'attend pas.
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await removePushSubscription({ endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  } catch (error) {
    console.error("[push] détachement", error);
  }
}
