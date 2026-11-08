/** Les comptes de `supabase/seed-local.sql`. */
export const ACCOUNTS = {
  owner: "owner@daydream.local",
  staff: "staff@daydream.local",
  tailleur: "tailleur@daydream.local",
} as const;

export type Role = keyof typeof ACCOUNTS;

export const PASSWORD = "daydream-local";

export const stateFile = (role: Role) => `e2e/.auth/${role}.json`;
