// ============================================================================
// Périodes de reporting d'un dossier : exercices importés et, pour chacun, les
// mois couverts. Alimente le filtre de période commun aux onglets (année par
// année, curseur sur les mois disponibles).
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { accesReporting } from "@/lib/reporting/acces";
import { moisCouverts } from "@/lib/reporting/periode";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    if (client.companyId !== session.user.companyId)
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    const acces = await accesReporting(id, session.user);
    if (acces instanceof NextResponse) return acces;

    const periodes = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { periodStart: true, periodEnd: true },
    });
    // Exercice d'un lot : année de début de sa période (UTC), comme les API de
    // reporting.
    const parAnnee = new Map<number, { periodStart: Date; periodEnd: Date }[]>();
    for (const p of periodes) {
      const a = p.periodStart.getUTCFullYear();
      parAnnee.set(a, [...(parAnnee.get(a) ?? []), p]);
    }
    const annees = [...parAnnee.entries()]
      .map(([annee, l]) => ({ annee, mois: moisCouverts(l) }))
      .filter((a) => a.mois.length > 0)
      .sort((x, y) => y.annee - x.annee);

    return NextResponse.json({ annees });
  } catch (error) {
    console.error("Périodes de reporting :", error);
    return NextResponse.json({ error: "Erreur lors de la lecture des périodes" }, { status: 500 });
  }
}
