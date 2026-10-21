/**
 * Le magasin du téléphone : une base IndexedDB, un seul magasin clé → valeur.
 *
 * Pas de dépendance : trois opérations suffisent, et `update()` fait sa
 * lecture-écriture dans UNE transaction — deux onglets qui ajoutent chacun un
 * geste à la file ne s'écrasent pas.
 *
 * Navigateur uniquement. Tout échec (navigation privée, stockage bloqué) rend
 * `undefined` ou ne fait rien : l'application marche sans, simplement sans
 * mode hors ligne.
 */
const DB = "daydream-offline";
const STORE = "kv";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // Un échec ne doit pas rester en cache : on réessaiera au prochain appel.
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    await done(tx);
    return request.result as T | undefined;
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    await done(tx);
  } catch {
    /* stockage indisponible : rien à garder */
  }
}

/** Lecture puis écriture dans la MÊME transaction. Rend la nouvelle valeur. */
export async function idbUpdate<T>(key: string, change: (current: T | undefined) => T): Promise<T | undefined> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let next: T | undefined;
    const request = store.get(key);
    request.onsuccess = () => {
      next = change(request.result as T | undefined);
      store.put(next, key);
    };
    await done(tx);
    return next;
  } catch {
    return undefined;
  }
}

/** Efface tout : déconnexion, changement de compte. */
export async function idbClear(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await done(tx);
  } catch {
    /* rien à effacer */
  }
}
