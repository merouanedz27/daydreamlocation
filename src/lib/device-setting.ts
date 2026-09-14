import { useCallback, useSyncExternalStore } from "react";

/* --------------------------------------------------------------------------
 * Réglage de confort stocké PAR APPAREIL.
 *
 * Le patron ne veut pas le même affichage sur son téléphone que sur un grand
 * écran. `localStorage` évite en plus une table et une migration pour un
 * simple réglage.
 *
 * Implémenté en `useSyncExternalStore` plutôt qu'en `useState` + `useEffect` :
 * le serveur ne peut pas connaître ce choix, donc le rendu serveur part de la
 * valeur par défaut (`getServerSnapshot`) et le client bascule sans
 * divergence d'hydratation. Bonus : l'événement `storage` synchronise les
 * onglets ouverts.
 *
 * La valeur vit en mémoire ET dans le stockage : si le stockage est bloqué
 * (navigation privée), le réglage tient au moins pour la session au lieu de
 * paraître sans effet.
 * ------------------------------------------------------------------------ */

export function createDeviceSetting<T>({
  key,
  fallback,
  sanitize,
}: {
  key: string;
  fallback: T;
  /** Valeur relue du stockage → valeur sûre, ou `null` si inutilisable. */
  sanitize: (value: unknown) => T | null;
}) {
  let current: { value: T } | null = null;
  const listeners = new Set<() => void>();

  function get(): T {
    if (current === null) {
      let stored: T | null = null;
      try {
        stored = sanitize(JSON.parse(localStorage.getItem(key) ?? "null"));
      } catch {
        /* stockage bloqué ou contenu illisible : valeur par défaut. */
      }
      current = { value: stored ?? fallback };
    }
    return current.value;
  }

  function getServerSnapshot(): T {
    return fallback;
  }

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        current = null; // forcer la relecture
        onChange();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }

  function set(next: T): void {
    current = { value: next };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* le réglage vaut pour la session, faute de mieux. */
    }
    for (const listener of listeners) listener();
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, getServerSnapshot);
  }

  return { get, set, useValue };
}

/**
 * Vrai si la media query correspond, `null` pendant le rendu serveur et
 * l'hydratation — là où la largeur de l'écran est encore inconnue.
 */
export function useMediaQuery(query: string): boolean | null {
  // Abonnement stable : sinon React se réabonne à chaque rendu.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
