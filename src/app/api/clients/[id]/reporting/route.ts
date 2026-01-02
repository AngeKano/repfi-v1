import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";

const clickhouseClient = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

function getClickhouseDbName(id: string): string {
  const cleanId = id.replace(/[^a-zA-Z0-9]/g, "_");
  return `repfi_${cleanId}`;
}

// ============================================================================
// STRUCTURE OHADA - COMPTE DE RÉSULTAT (SYSCOHADA)
// ============================================================================

interface RubriquesOHADA {
  // --- ACTIVITÉ D'EXPLOITATION ---
  // Chiffre d'affaires (XB)
  TA: number; // Ventes de marchandises (+)
  TB: number; // Ventes de produits fabriqués (+)
  TC: number; // Travaux, services vendus (+)
  TD: number; // Produits accessoires (+)

  // Marge commerciale (XA)
  RA: number; // Achats de marchandises (-)
  RB: number; // Variation de stocks de marchandises (-/+)

  // Valeur ajoutée (XC)
  TE: number; // Production stockée (-/+)
  TF: number; // Production immobilisée (+)
  TG: number; // Subventions d'exploitation (+)
  TH: number; // Autres produits (+)
  TI: number; // Transferts de charges d'exploitation (+)
  RC: number; // Achats de matières premières (-)
  RD: number; // Variation de stocks matières premières (-/+)
  RE: number; // Autres achats (-)
  RF: number; // Variation de stocks autres approvisionnements (-/+)
  RG: number; // Transports (-)
  RH: number; // Services extérieurs (-)
  RI: number; // Impôts et taxes (-)
  RJ: number; // Autres charges (-)

  // Excédent brut d'exploitation (XD)
  RK: number; // Charges de personnel (-)

  // Résultat d'exploitation (XE)
  TJ: number; // Reprises d'amortissements, provisions et dépréciations (+)
  RL: number; // Dotations aux amortissements, provisions et dépréciations (-)

  // --- ACTIVITÉ FINANCIÈRE ---
  // Résultat financier (XF)
  TK: number; // Revenus financiers et assimilés (+)
  TL: number; // Reprises de provisions financières (+)
  TM: number; // Transferts de charges financières (+)
  RM: number; // Frais financiers et charges assimilées (-)
  RN: number; // Dotations aux provisions financières (-)

  // --- HORS ACTIVITÉS ORDINAIRES (HAO) ---
  // Résultat HAO (XH)
  TN: number; // Produits des cessions d'immobilisations (+)
  TO: number; // Autres produits HAO (+)
  RO: number; // Valeurs comptables des cessions d'immobilisations (-)
  RP: number; // Autres charges HAO (-)

  // --- RÉSULTAT NET ---
  RQ: number; // Participation des travailleurs (-)
  RS: number; // Impôts sur le résultat (-)
}

interface SoldesIntermediairesGestion {
  // Soldes intermédiaires de gestion (SIG)
  XA: number; // Marge commerciale
  XB: number; // Chiffre d'affaires
  XC: number; // Valeur ajoutée
  XD: number; // Excédent brut d'exploitation (EBE)
  XE: number; // Résultat d'exploitation
  XF: number; // Résultat financier
  XG: number; // Résultat des activités ordinaires (RAO)
  XH: number; // Résultat hors activités ordinaires (HAO)
  XI: number; // Résultat net
}

interface IndicateursFinanciers {
  chiffreAffaires: number;      // XB
  masseSalariale: number;       // RK (valeur absolue)
  resultatExploitation: number; // XE
  resultatNet: number;          // XI
  soldeTresorerie: number;
  // Détails supplémentaires
  margeCommerciale: number;     // XA
  valeurAjoutee: number;        // XC
  ebe: number;                  // XD - Excédent Brut d'Exploitation
  resultatFinancier: number;    // XF
  resultatHAO: number;          // XH
}

async function recupererRubriques(
  dbName: string,
  batchIds: string[]
): Promise<RubriquesOHADA> {
  const rubriquesVides: RubriquesOHADA = {
    TA: 0, TB: 0, TC: 0, TD: 0,
    RA: 0, RB: 0,
    TE: 0, TF: 0, TG: 0, TH: 0, TI: 0,
    RC: 0, RD: 0, RE: 0, RF: 0, RG: 0, RH: 0, RI: 0, RJ: 0,
    RK: 0,
    TJ: 0, RL: 0,
    TK: 0, TL: 0, TM: 0, RM: 0, RN: 0,
    TN: 0, TO: 0, RO: 0, RP: 0,
    RQ: 0, RS: 0,
  };

  if (batchIds.length === 0) {
    return rubriquesVides;
  }

  // Requête structurée par rubrique
  const data = await clickhouseClient.query({
    query: `
      SELECT
        rubrique,
        sum(credit - debit) as solde
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND rubrique IN (
          'TA', 'TB', 'TC', 'TD',
          'RA', 'RB',
          'TE', 'TF', 'TG', 'TH', 'TI',
          'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ',
          'RK',
          'TJ', 'RL',
          'TK', 'TL', 'TM', 'RM', 'RN',
          'TN', 'TO', 'RO', 'RP',
          'RQ', 'RS'
        )
      GROUP BY rubrique
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{ rubrique: string; solde: string }>;

  const rubriques = { ...rubriquesVides };
  for (const row of rows) {
    const key = row.rubrique as keyof RubriquesOHADA;
    if (key in rubriques) {
      rubriques[key] = parseFloat(row.solde) || 0;
    }
  }

  return rubriques;
}

async function recupererSoldeTresorerie(
  dbName: string,
  batchIds: string[]
): Promise<number> {
  if (batchIds.length === 0) return 0;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        sum(CASE WHEN startsWith(compte, '52') THEN debit - credit ELSE 0 END) as banques,
        sum(CASE WHEN startsWith(compte, '57') THEN debit - credit ELSE 0 END) as caisse
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as any[];
  const row = rows[0] || {};
  
  const banques = parseFloat(row.banques) || 0;
  const caisse = parseFloat(row.caisse) || 0;
  
  return banques + caisse;
}

function calculerSIG(rubriques: RubriquesOHADA): SoldesIntermediairesGestion {
  const {
    TA, TB, TC, TD,
    RA, RB,
    TE, TF, TG, TH, TI,
    RC, RD, RE, RF, RG, RH, RI, RJ,
    RK,
    TJ, RL,
    TK, TL, TM, RM, RN,
    TN, TO, RO, RP,
    RQ, RS,
  } = rubriques;

  // ============================================================================
  // CALCUL DES SOLDES INTERMÉDIAIRES DE GESTION (SIG) - SYSCOHADA
  // ============================================================================

  // XB - CHIFFRE D'AFFAIRES = TA + TB + TC + TD
  const XB = TA + TB + TC + TD;

  // XA - MARGE COMMERCIALE = TA + RA + RB
  // Note: RA et RB ont déjà le signe négatif (charges)
  const XA = TA + RA + RB;

  // XC - VALEUR AJOUTÉE = XB + RA + RB + (somme TE à RJ)
  // Formule: XA + TB + TC + TD + TE + TF + TG + TH + TI + RC + RD + RE + RF + RG + RH + RI + RJ
  const XC = XA + TB + TC + TD + TE + TF + TG + TH + TI + RC + RD + RE + RF + RG + RH + RI + RJ;

  // XD - EXCÉDENT BRUT D'EXPLOITATION (EBE) = XC + RK
  // Note: RK a le signe négatif (charge)
  const XD = XC + RK;

  // XE - RÉSULTAT D'EXPLOITATION = XD + TJ + RL
  // TJ (+) reprises, RL (-) dotations
  const XE = XD + TJ + RL;

  // XF - RÉSULTAT FINANCIER = TK + TL + TM + RM + RN
  // TK, TL, TM (+) produits, RM, RN (-) charges
  const XF = TK + TL + TM + RM + RN;

  // XG - RÉSULTAT DES ACTIVITÉS ORDINAIRES = XE + XF
  const XG = XE + XF;

  // XH - RÉSULTAT HAO = TN + TO + RO + RP
  // TN, TO (+) produits, RO, RP (-) charges
  const XH = TN + TO + RO + RP;

  // XI - RÉSULTAT NET = XG + XH + RQ + RS
  // RQ, RS (-) charges
  const XI = XG + XH + RQ + RS;

  return { XA, XB, XC, XD, XE, XF, XG, XH, XI };
}

async function calculerIndicateurs(
  dbName: string,
  batchIds: string[]
): Promise<IndicateursFinanciers> {
  if (batchIds.length === 0) {
    return {
      chiffreAffaires: 0,
      masseSalariale: 0,
      resultatExploitation: 0,
      resultatNet: 0,
      soldeTresorerie: 0,
      margeCommerciale: 0,
      valeurAjoutee: 0,
      ebe: 0,
      resultatFinancier: 0,
      resultatHAO: 0,
    };
  }

  // Récupérer les rubriques OHADA
  const rubriques = await recupererRubriques(dbName, batchIds);
  
  // Calculer les SIG
  const sig = calculerSIG(rubriques);
  
  // Récupérer le solde de trésorerie (comptes 52 et 57)
  const soldeTresorerie = await recupererSoldeTresorerie(dbName, batchIds);

  return {
    chiffreAffaires: sig.XB,
    masseSalariale: Math.abs(rubriques.RK), // Valeur absolue pour affichage
    resultatExploitation: sig.XE,
    resultatNet: sig.XI,
    soldeTresorerie,
    margeCommerciale: sig.XA,
    valeurAjoutee: sig.XC,
    ebe: sig.XD,
    resultatFinancier: sig.XF,
    resultatHAO: sig.XH,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    if (client.companyId !== session.user.companyId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const dbName = getClickhouseDbName(id);
    const yearN = parseInt(year);
    const yearN1 = yearN - 1;

    // Périodes année N
    const postgresPeriodsData = await prisma.comptablePeriod.findMany({
      where: {
        clientId: id,
        periodStart: {
          gte: new Date(`${yearN}-01-01`),
          lt: new Date(`${yearN + 1}-01-01`),
        },
      },
      select: {
        id: true,
        batchId: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        excelFileUrl: true,
      },
      orderBy: { periodStart: "asc" },
    });

    // Périodes année N-1
    const postgresPeriodsN1 = await prisma.comptablePeriod.findMany({
      where: {
        clientId: id,
        periodStart: {
          gte: new Date(`${yearN1}-01-01`),
          lt: new Date(`${yearN}-01-01`),
        },
      },
      select: { batchId: true },
    });

    // Années disponibles
    const availableYearsData = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { periodStart: true },
      distinct: ["periodStart"],
    });

    const availableYears = [
      ...new Set(
        availableYearsData.map((p) => p.periodStart.getFullYear().toString())
      ),
    ].sort((a, b) => parseInt(b) - parseInt(a));

    const batchIds = postgresPeriodsData
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);
    const batchIdsN1 = postgresPeriodsN1
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);

    // Calcul des indicateurs N et N-1
    const indicateursN = await calculerIndicateurs(dbName, batchIds);
    const indicateursN1 = await calculerIndicateurs(dbName, batchIdsN1);

    // Calcul des variations (%)
    const calculerVariation = (n: number, n1: number): number =>
      n1 !== 0 ? ((n - n1) / Math.abs(n1)) * 100 : n !== 0 ? 100 : 0;

    const variations = {
      chiffreAffaires: calculerVariation(indicateursN.chiffreAffaires, indicateursN1.chiffreAffaires),
      masseSalariale: calculerVariation(indicateursN.masseSalariale, indicateursN1.masseSalariale),
      resultatExploitation: calculerVariation(indicateursN.resultatExploitation, indicateursN1.resultatExploitation),
      resultatNet: calculerVariation(indicateursN.resultatNet, indicateursN1.resultatNet),
      soldeTresorerie: calculerVariation(indicateursN.soldeTresorerie, indicateursN1.soldeTresorerie),
      margeCommerciale: calculerVariation(indicateursN.margeCommerciale, indicateursN1.margeCommerciale),
      valeurAjoutee: calculerVariation(indicateursN.valeurAjoutee, indicateursN1.valeurAjoutee),
      ebe: calculerVariation(indicateursN.ebe, indicateursN1.ebe),
      resultatFinancier: calculerVariation(indicateursN.resultatFinancier, indicateursN1.resultatFinancier),
      resultatHAO: calculerVariation(indicateursN.resultatHAO, indicateursN1.resultatHAO),
    };

    // Données mensuelles
    let monthlyRows: any[] = [];
    if (batchIds.length > 0) {
      const monthlyData = await clickhouseClient.query({
        query: `
          SELECT 
            substring(date_transaction, 4, 2) as month,
            sum(CASE WHEN startsWith(compte, '6') THEN debit - credit ELSE 0 END) as charges,
            sum(CASE WHEN startsWith(compte, '7') THEN credit - debit ELSE 0 END) as produits,
            count(*) as nb_transactions
          FROM ${dbName}.grand_livre
          WHERE batch_id IN ({batchIds:Array(String)})
          GROUP BY month
          ORDER BY month
        `,
        query_params: { batchIds },
        format: "JSONEachRow",
      });
      monthlyRows = (await monthlyData.json()) as any[];
    }

    const monthNames = [
      "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
      "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
    ];

    const allMonths = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, "0");
      const found = monthlyRows.find((r: any) => r.month === monthStr);
      allMonths.push({
        month: `${year}${monthStr}`,
        monthLabel: monthNames[m - 1],
        charges: found ? parseFloat(found.charges) || 0 : 0,
        produits: found ? parseFloat(found.produits) || 0 : 0,
        nbTransactions: found ? parseInt(found.nb_transactions) || 0 : 0,
      });
    }

    let cumulativeBalance = 0;
    const monthlyWithCumulative = allMonths.map((row) => {
      const resultat = row.produits - row.charges;
      cumulativeBalance += resultat;
      return { ...row, resultat, cumulativeBalance };
    });

    // Périodes enrichies
    const periods = await Promise.all(
      postgresPeriodsData.map(async (pgPeriod) => {
        let stats = { charges: 0, produits: 0, nb_transactions: 0 };
        if (pgPeriod.batchId) {
          try {
            const statsData = await clickhouseClient.query({
              query: `
                SELECT 
                  sum(CASE WHEN startsWith(compte, '6') THEN debit - credit ELSE 0 END) as charges,
                  sum(CASE WHEN startsWith(compte, '7') THEN credit - debit ELSE 0 END) as produits,
                  count(*) as nb_transactions
                FROM ${dbName}.grand_livre
                WHERE batch_id = {batchId:String}
              `,
              query_params: { batchId: pgPeriod.batchId },
              format: "JSONEachRow",
            });
            const statsRows = (await statsData.json()) as any[];
            if (statsRows.length > 0) stats = statsRows[0];
          } catch (e) {
            console.error("Stats error:", e);
          }
        }
        return {
          id: pgPeriod.id,
          batch_id: pgPeriod.batchId,
          periodStart: pgPeriod.periodStart,
          periodEnd: pgPeriod.periodEnd,
          status: pgPeriod.status,
          excelFileUrl: pgPeriod.excelFileUrl,
          charges: parseFloat(stats.charges as any) || 0,
          produits: parseFloat(stats.produits as any) || 0,
          nb_transactions: stats.nb_transactions || 0,
        };
      })
    );

    const totals = monthlyWithCumulative.reduce(
      (acc, row) => ({
        totalCharges: acc.totalCharges + row.charges,
        totalProduits: acc.totalProduits + row.produits,
        totalTransactions: acc.totalTransactions + row.nbTransactions,
      }),
      { totalCharges: 0, totalProduits: 0, totalTransactions: 0 }
    );

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      year,
      availableYears: availableYears.length > 0 ? availableYears : [year],
      monthly: monthlyWithCumulative,
      periods,
      totals: {
        ...totals,
        resultat: totals.totalProduits - totals.totalCharges,
      },
      indicateurs: {
        anneeN: indicateursN,
        anneeN1: indicateursN1,
        variations,
      },
    });
  } catch (error) {
    console.error("Reporting API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données" },
      { status: 500 }
    );
  }
}