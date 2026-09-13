import { createClient } from "@/lib/supabase/server";

export type EnsemblePiece = {
  unit_id: number;
  ref_code: string;
  size: string | null;
  status: string;
  price: number;
  model_name_fr: string;
  model_name_ar: string | null;
};

export type EnsembleDetail = {
  id: number;
  name: string;
  description: string | null;
  package_price: number | null;
  pieces: EnsemblePiece[];
};

type RawEnsemble = {
  id: number;
  name: string;
  description: string | null;
  package_price: number | null;
  ensemble_items: {
    article_units: {
      id: number;
      ref_code: string;
      size: string | null;
      status: string;
      price_override: number | null;
      article_models: { name_fr: string; name_ar: string | null; base_price: number } | null;
    } | null;
  }[];
};

const SELECT = `id, name, description, package_price,
  ensemble_items ( article_units ( id, ref_code, size, status, price_override,
    article_models ( name_fr, name_ar, base_price ) ) )`;

function toDetail(e: RawEnsemble): EnsembleDetail {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    package_price: e.package_price,
    pieces: (e.ensemble_items ?? [])
      .map((i) => i.article_units)
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((u) => ({
        unit_id: u.id,
        ref_code: u.ref_code,
        size: u.size,
        status: u.status,
        // Même résolution que la saisie de commande : prix de la pièce, sinon
        // celui du modèle.
        price: u.price_override ?? u.article_models?.base_price ?? 0,
        model_name_fr: u.article_models?.name_fr ?? "",
        model_name_ar: u.article_models?.name_ar ?? null,
      }))
      .sort((a, b) => a.ref_code.localeCompare(b.ref_code)),
  };
}

/**
 * Tous les ensembles avec leurs pièces. Lisible par toute l'équipe : l'employé
 * doit pouvoir vérifier ce que contient « Costume n°12 » avant de le proposer.
 *
 * Un catalogue d'ensembles se compte en dizaines : une seule requête suffit.
 */
export async function getEnsembles(): Promise<EnsembleDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ensembles").select(SELECT).order("name");
  return ((data ?? []) as unknown as RawEnsemble[]).map(toDetail);
}

export async function getEnsemble(id: number): Promise<EnsembleDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ensembles").select(SELECT).eq("id", id).maybeSingle();
  return data ? toDetail(data as unknown as RawEnsemble) : null;
}
