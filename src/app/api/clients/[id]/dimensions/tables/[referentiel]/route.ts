// ============================================================================
// Contenu d'un référentiel (plan comptable, mapping, plan tiers, codes
// journaux) : lecture paginée et filtrée, modification d'une ligne.
//
//   GET   ?search=&sortBy=&sortDir=&page=&f.<colonne>=v…&options=1
//           → page de lignes ; filtres répétables par colonne (1..n valeurs),
//             comme ceux du grand livre ; options=1 ajoute les valeurs
//             proposées par chaque filtre.
//   PATCH { cle, valeurs: { colonne: valeur } } → modification d'une ligne.
//
// La clé n'est jamais modifiable et aucune ligne n'est supprimée. Les
// intitulés recopiés dans le grand livre — et dans les écritures saisies —
// suivent la modification. Le mapping, reconstruit par Airflow à chaque
// import, est en lecture seule.
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
  listerDimension,
  modifierDimension,
  optionsFiltresDimension,
  type FiltresReferentiel,
} from "@/lib/clickhouse/dimensions-table";
import { colonneCle, estDimension, referentielParId } from "@/lib/comptable/dimensions";

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
      }),
      // Calculées une fois par référentiel affiché, pas à chaque page.
      sp.get("options") === "1" ? optionsFiltresDimension(clickhouse, dbName, def) : null,
    ]);

    return NextResponse.json({
      ...page,
      ...(options ? { options } : {}),
      canEdit: !def.lectureSeule && checkPermissionSync(user.role, FICHIERS_ACTIONS.CHARGER),
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
  cle: z.string().trim().min(1),
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

    if (def.lectureSeule || !estDimension(def)) {
      return NextResponse.json(
        { error: `${def.label} : table reconstruite à chaque import, en lecture seule.` },
        { status: 403 },
      );
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    const { cle, valeurs } = parsed.data;

    // Seules les colonnes éditables sont acceptées : la clé reste intouchable.
    const editables = new Map(def.colonnes.filter((c) => c.editable).map((c) => [c.nom, c]));
    for (const [nom, valeur] of Object.entries(valeurs)) {
      const col = editables.get(nom);
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

    // Une mise à jour par fichier en cours réécrirait la table en parallèle.
    const enCours = await prisma.dimensionUpdate.findFirst({
      where: {
        clientId: id,
        fileType: def.fileType,
        status: { in: [ProcessingStatus.VALIDATING, ProcessingStatus.PROCESSING] },
      },
      select: { id: true },
    });
    if (enCours)
      return NextResponse.json(
        { error: `Une mise à jour « ${def.label} » par fichier est en cours : réessayez à sa fin.` },
        { status: 409 },
      );

    const dbName = getClickhouseDbName(id);
    let resultat;
    try {
      resultat = await modifierDimension(clickhouse, dbName, def, cle, valeurs);
    } catch (e) {
      if (e instanceof Error && e.message === "introuvable")
        return NextResponse.json(
          { error: `${colonneCle(def).libelle} ${cle} introuvable.` },
          { status: 404 },
        );
      throw e;
    }

    // Les écritures saisies (source de vérité Postgres) portent aussi une
    // copie de l'intitulé : on l'aligne, sinon la prochaine synchronisation
    // des saisies réécrirait l'ancienne valeur dans le grand livre.
    let saisiesMaj = 0;
    if (resultat.modifiee) {
      const champs: Record<string, string> = {};
      for (const c of def.colonnes) {
        const valeur = resultat.ligne[c.nom];
        if (c.saisie && valeur) champs[c.saisie] = valeur;
      }
      if (Object.keys(champs).length > 0 && def.cleGrandLivre) {
        const filtre = def.cleGrandLivre === "compte" ? { compte: cle } : { nTiers: cle };
        const r = await prisma.manualLedgerEntry.updateMany({
          where: { clientId: id, ...filtre },
          data: champs,
        });
        saisiesMaj = r.count;
      }
      invaliderReferentiels(dbName);
    }

    return NextResponse.json({
      ligne: resultat.ligne,
      modifiee: resultat.modifiee,
      grandLivre: resultat.grandLivre,
      saisies: saisiesMaj,
    });
  } catch (error) {
    console.error("Referentiel PATCH error:", error);
    return NextResponse.json({ error: "Erreur lors de la modification" }, { status: 500 });
  }
}
