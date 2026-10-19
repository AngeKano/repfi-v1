// ============================================================================
// Contenu d'un référentiel (plan comptable, mapping PLE, plan tiers, codes
// journaux) : lecture paginée et filtrée, export, modification d'une ligne.
//
//   GET   ?search=&sortBy=&sortDir=&page=&f.<colonne>=v…&options=1&export=1
//           → page de lignes ; filtres répétables par colonne (1..n valeurs),
//             comme ceux du grand livre ; options=1 ajoute les valeurs
//             proposées par chaque filtre ; export=1 renvoie toutes les
//             lignes filtrées (téléchargement Excel).
//   PATCH { cles: { colonne clé: valeur }, valeurs: { colonne: valeur } }
//           → modification d'une ligne, identifiée par TOUTES ses colonnes
//             clés (une seule, sauf pour le mapping).
//   POST  { valeurs: { colonne: valeur } }
//           → ajout d'une ligne nouvelle ; refusé si la clé existe déjà.
//
// La clé n'est jamais modifiable et aucune ligne n'est supprimée. Les
// intitulés recopiés dans le grand livre — et dans les écritures saisies —
// suivent la modification. Une modification du mapping n'agit sur les
// écritures déjà chargées qu'après leur reclassement (voir /reclassement).
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";
import { ProcessingStatus } from "../../../../../../../../prisma/generated/prisma/enums";
import {
  requirePermission,
  checkPermissionSync,
  FICHIERS_ACTIONS,
} from "@/lib/permissions";
import { getClickhouseDbName } from "@/lib/clickhouse/manual-sync";
import { invaliderReferentiels } from "@/lib/clickhouse/plan-comptable";
import {
  ajouterDimension,
  listerDimension,
  modifierDimension,
  optionsFiltresDimension,
  type FiltresReferentiel,
} from "@/lib/clickhouse/dimensions-table";
import {
  colonneCle,
  colonnesCles,
  preparerNouvelleLigne,
  referentielParId,
  type DimensionDef,
} from "@/lib/comptable/dimensions";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

const LONGUEUR_MAX = 255;

async function contexte(id: string, referentiel: string, companyId: string) {
  const client = await prisma.client.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!client) return { erreur: NextResponse.json({ error: "Client non trouvé" }, { status: 404 }) };
  const def = referentielParId(referentiel);
  if (!def) return { erreur: NextResponse.json({ error: "Référentiel inconnu" }, { status: 400 }) };
  return { def };
}

/**
 * Les écritures saisies (source de vérité Postgres) portent une copie des
 * intitulés du compte et du tiers : on l'aligne, sinon la prochaine
 * synchronisation des saisies réécrirait l'ancienne valeur dans le grand livre.
 * Renvoie le nombre d'écritures mises à jour.
 */
async function alignerSaisies(
  clientId: string,
  def: DimensionDef,
  cle: string,
  ligne: Record<string, string>,
): Promise<number> {
  const champs: Record<string, string> = {};
  for (const c of def.colonnes) {
    const valeur = ligne[c.nom];
    if (c.saisie && valeur) champs[c.saisie] = valeur;
  }
  if (Object.keys(champs).length === 0 || !def.cleGrandLivre) return 0;
  const filtre = def.cleGrandLivre === "compte" ? { compte: cle } : { nTiers: cle };
  const r = await prisma.manualLedgerEntry.updateMany({
    where: { clientId, ...filtre },
    data: champs,
  });
  return r.count;
}

/** Une mise à jour par fichier en cours réécrirait la table en parallèle. */
async function miseAJourEnCours(clientId: string, def: DimensionDef) {
  const enCours = await prisma.dimensionUpdate.findFirst({
    where: {
      clientId,
      fileType: def.fileType,
      status: { in: [ProcessingStatus.VALIDATING, ProcessingStatus.PROCESSING] },
    },
    select: { id: true },
  });
  return enCours
    ? NextResponse.json(
        { error: `Une mise à jour « ${def.label} » par fichier est en cours : réessayez à sa fin.` },
        { status: 409 },
      )
    : null;
}

// ============================================================================
// GET — lecture
// ============================================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; referentiel: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.VOIR);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id, referentiel } = await params;
    const ctx = await contexte(id, referentiel, user.companyId);
    if (ctx.erreur) return ctx.erreur;
    const def = ctx.def;

    const sp = new URL(req.url).searchParams;
    // Filtres : un paramètre « f.<colonne> » répétable par valeur retenue.
    const filtres: FiltresReferentiel = {};
    for (const c of def.colonnes) {
      const valeurs = sp.getAll(`f.${c.nom}`).filter((v) => v !== "");
      if (valeurs.length) filtres[c.nom] = valeurs;
    }

    const dbName = getClickhouseDbName(id);
    const [page, options] = await Promise.all([
      listerDimension(clickhouse, dbName, def, {
        search: sp.get("search") || "",
        filtres,
        sortBy: sp.get("sortBy") || "",
        sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
        page: parseInt(sp.get("page") || "1", 10) || 1,
        tout: sp.get("export") === "1",
      }),
      // Calculées une fois par référentiel affiché, pas à chaque page.
      sp.get("options") === "1" ? optionsFiltresDimension(clickhouse, dbName, def) : null,
    ]);

    return NextResponse.json({
      ...page,
      ...(options ? { options } : {}),
      canEdit: checkPermissionSync(user.role, FICHIERS_ACTIONS.CHARGER),
    });
  } catch (error) {
    console.error("Referentiel GET error:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture du référentiel" }, { status: 500 });
  }
}

// ============================================================================
// PATCH — modification d'une ligne
// ============================================================================
const patchSchema = z.object({
  cles: z.record(z.string(), z.string()),
  valeurs: z.record(z.string(), z.string()),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; referentiel: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id, referentiel } = await params;
    const ctx = await contexte(id, referentiel, user.companyId);
    if (ctx.erreur) return ctx.erreur;
    const def = ctx.def;

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    const { cles, valeurs } = parsed.data;

    // La ligne est désignée par toutes ses colonnes clés.
    for (const c of colonnesCles(def)) {
      if (cles[c.nom] === undefined)
        return NextResponse.json({ error: `Clé incomplète : ${c.libelle} manquant.` }, { status: 400 });
    }
    const cle = cles[colonneCle(def).nom];
    if (!cle?.trim()) return NextResponse.json({ error: "Clé manquante" }, { status: 400 });

    // Seules les colonnes éditables sont acceptées : la clé reste intouchable.
    const editables = new Map(def.colonnes.filter((c) => c.editable).map((c) => [c.nom, c]));
    for (const [nom, brute] of Object.entries(valeurs)) {
      const col = editables.get(nom);
      // Codes de rubrique toujours en majuscules, comme à l'ajout.
      const valeur = col?.majuscules ? brute.toUpperCase() : brute;
      valeurs[nom] = valeur;
      if (!col)
        return NextResponse.json({ error: `Champ non modifiable : ${nom}` }, { status: 400 });
      if (col.requis && !valeur.trim())
        return NextResponse.json({ error: `${col.libelle} obligatoire.` }, { status: 400 });
      if (valeur.length > LONGUEUR_MAX)
        return NextResponse.json(
          { error: `${col.libelle} : ${LONGUEUR_MAX} caractères maximum.` },
          { status: 400 },
        );
    }

    const bloque = await miseAJourEnCours(id, def);
    if (bloque) return bloque;

    const dbName = getClickhouseDbName(id);
    let resultat;
    try {
      resultat = await modifierDimension(clickhouse, dbName, def, cles, valeurs);
    } catch (e) {
      if (e instanceof Error && e.message === "introuvable")
        return NextResponse.json(
          { error: `${colonneCle(def).libelle} ${cle} introuvable.` },
          { status: 404 },
        );
      throw e;
    }

    let saisiesMaj = 0;
    if (resultat.modifiee) {
      saisiesMaj = await alignerSaisies(id, def, cle, resultat.ligne);
      invaliderReferentiels(dbName);
    }

    return NextResponse.json({
      // En texte, comme les lignes de la liste.
      ligne: Object.fromEntries(
        Object.entries(resultat.ligne).map(([k, v]) => [k, v == null ? "" : String(v)]),
      ),
      modifiee: resultat.modifiee,
      grandLivre: resultat.grandLivre,
      saisies: saisiesMaj,
      // Mapping modifié : les écritures déjà chargées restent classées selon
      // l'ancienne version tant qu'elles ne sont pas reclassées.
      reclassementRequis: !!def.reclassement && resultat.modifiee,
    });
  } catch (error) {
    console.error("Referentiel PATCH error:", error);
    return NextResponse.json({ error: "Erreur lors de la modification" }, { status: 500 });
  }
}

// ============================================================================
// POST — ajout d'une ligne nouvelle
// ============================================================================
const postSchema = z.object({
  valeurs: z.record(z.string(), z.string()),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; referentiel: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id, referentiel } = await params;
    const ctx = await contexte(id, referentiel, user.companyId);
    if (ctx.erreur) return ctx.erreur;
    const def = ctx.def;

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    // Même contrôle que le formulaire : c'est celui-ci qui fait foi.
    const prep = preparerNouvelleLigne(def, parsed.data.valeurs);
    if ("erreur" in prep) return NextResponse.json({ error: prep.erreur }, { status: 400 });

    const bloque = await miseAJourEnCours(id, def);
    if (bloque) return bloque;

    const dbName = getClickhouseDbName(id);
    const cle = prep.ligne[colonneCle(def).nom];
    let resultat;
    try {
      resultat = await ajouterDimension(clickhouse, dbName, def, prep.ligne);
    } catch (e) {
      if (e instanceof Error && e.message === "existe")
        return NextResponse.json(
          {
            error:
              `${def.label} : cette ligne existe déjà (${colonnesCles(def)
                .map((c) => `${c.libelle} ${prep.ligne[c.nom] || "(vide)"}`)
                .join(", ")}). Utilisez « Modifier ».`,
          },
          { status: 409 },
        );
      if (e instanceof Error && e.message === "schema")
        return NextResponse.json(
          { error: `${def.label} : table introuvable ou incomplète pour ce client.` },
          { status: 409 },
        );
      throw e;
    }

    const saisiesMaj = await alignerSaisies(id, def, cle, resultat.ligne);
    invaliderReferentiels(dbName);

    return NextResponse.json(
      {
        ligne: resultat.ligne,
        grandLivre: resultat.grandLivre,
        saisies: saisiesMaj,
        // Mapping enrichi : les écritures déjà chargées ne le prennent en
        // compte qu'après reclassement.
        reclassementRequis: !!def.reclassement,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Referentiel POST error:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout" }, { status: 500 });
  }
}
