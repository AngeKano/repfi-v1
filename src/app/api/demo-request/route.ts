import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";

// ============================================================================
// /api/demo-request  (POST)
// Reçoit une demande de démo depuis la page /presentation et la transmet par
// email à l'adresse interne (DEMO_EMAIL_TO). Aucun stockage en base.
//
// Variables d'environnement requises :
//   RESEND_API_KEY    Clé API Resend  (https://resend.com)
//   DEMO_EMAIL_TO     Destinataire    (par défaut : contact@clickinsight.org)
//   DEMO_EMAIL_FROM   Expéditeur      (par défaut : onboarding@resend.dev — sandbox Resend)
// ============================================================================

const demoRequestSchema = z.object({
  // Champs obligatoires
  nom: z.string().trim().min(1, "Nom requis").max(80),
  prenom: z.string().trim().min(1, "Prénom requis").max(80),
  entreprise: z.string().trim().min(1, "Entreprise requise").max(120),
  email: z.string().trim().email("Email invalide").max(160),
  consent: z
    .boolean()
    .refine((v) => v === true, {
      message: "Vous devez accepter le traitement des données",
    }),
  // Champs optionnels
  telephone: z.string().trim().max(40).optional().or(z.literal("")),
  commentaire: z.string().trim().max(2000).optional().or(z.literal("")),
  // Honeypot : doit rester vide. Si un bot le remplit, on accepte la requête
  // (renvoi 200) mais on n'envoie aucun email.
  website: z.string().optional(),
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(payload: {
  nom: string;
  prenom: string;
  entreprise: string;
  email: string;
  telephone?: string;
  commentaire?: string;
}): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;background:#f5f9ff;color:#335890;font-weight:600;width:160px;border:1px solid #d0e3f5;">${label}</td>
      <td style="padding:8px 12px;color:#00122e;border:1px solid #d0e3f5;">${escapeHtml(value)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f5f9ff;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d0e3f5;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0077c3,#0095f4);padding:24px 28px;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;font-weight:700;">Nouvelle demande de démo REPFI</h1>
        <p style="margin:4px 0 0 0;font-size:13px;opacity:0.9;">Reçue depuis la page /presentation</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row("Nom", payload.nom)}
          ${row("Prénom", payload.prenom)}
          ${row("Entreprise", payload.entreprise)}
          ${row("Email", payload.email)}
          ${payload.telephone ? row("Téléphone", payload.telephone) : ""}
          ${payload.commentaire ? row("Commentaire", payload.commentaire) : ""}
        </table>
        <p style="margin:20px 0 0 0;font-size:12px;color:#94a3b8;">
          Répondez directement à cet email pour contacter le prospect (Reply-To
          configuré sur son adresse).
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON invalide" }, { status: 400 });
  }

  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Honeypot : un bot remplit ce champ caché ; on simule un succès silencieux.
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[demo-request] RESEND_API_KEY manquante");
    return NextResponse.json(
      { error: "Service d'envoi non configuré" },
      { status: 500 },
    );
  }

  const to = process.env.DEMO_EMAIL_TO || "contact@clickinsight.org";
  const from = process.env.DEMO_EMAIL_FROM || "REPFI <onboarding@resend.dev>";

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: data.email,
      subject: `Nouvelle demande de démo REPFI — ${data.entreprise} (${data.prenom} ${data.nom})`,
      html: buildEmailHtml(data),
    });

    if (error) {
      console.error("[demo-request] Resend error:", error);
      return NextResponse.json(
        { error: "Échec de l'envoi de l'email" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[demo-request] Unexpected error:", err);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'envoi" },
      { status: 500 },
    );
  }
}
