"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Edit,
  Trash2,
  EyeOff,
  Users,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronDown,
} from "lucide-react";
import {
  PiChartScatterDuotone,
  PiCoinsDuotone,
  PiChartDonutDuotone,
  PiHandCoinsDuotone,
  PiScalesDuotone,
  PiMoneyWavyDuotone,
  PiWalletDuotone,
  PiPercentDuotone,
  PiBankDuotone,
  PiBookOpenDuotone,
  PiFileTextDuotone,
  PiUsersThreeDuotone,
  PiUploadSimpleDuotone,
  PiFilesDuotone,
  PiPresentationChartDuotone,
  PiNotePencilDuotone,
} from "react-icons/pi";
import Link from "next/link";
import FilesTabs from "./files-tabs";
import SaisieTab from "./saisie";
import DeclarationTabs from "./declaration/declaration-tabs";
import ClientReportingChart from "@/components/reporting/client-reporting-chart";
import ClientDettesTab from "@/components/reporting/client-dettes-tab";
import ClientDettesCourtTermeTab from "@/components/reporting/client-dettes-court-terme-tab";
import ClientTresorerieTab from "@/components/reporting/client-tresorerie-tab";
import ClientRatiosTab from "@/components/reporting/client-ratios-tab";
import ClientDettesFinancieresTab from "@/components/reporting/client-dettes-financieres-tab";
import ClientBilanTab from "@/components/reporting/client-bilan-tab";
import ClientEtatsFinanciersTab from "@/components/reporting/client-etats-financiers-tab";
import FiltrePeriode, {
  periodeSurAnnee,
  type AnneeReporting,
  type Periode,
} from "@/components/reporting/filtre-periode";
import { VisibiliteProvider } from "@/components/reporting/visibilite";
import { ongletVisible } from "@/lib/reporting/elements";
import { MembresTab } from "./membres";
import { UploadFileDialog } from "./upload-file-dialog";
import { ClientDetailsDialog } from "@/app/clients/client-details-dialog";
import { DeleteClientDialog } from "@/app/clients/delete-client-dialog";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DEVISE, UNITE_ABREGEE } from "@/lib/devise";


interface ClientDetailsClientProps {
  session: any;
  initialClient: any;
  canEdit: boolean;
  canDelete: boolean;
  canViewFiles: boolean;
  canDeleteFiles: boolean;
  canViewMembers: boolean;
  canViewReporting: boolean;
  canExportReporting: boolean;
  /** Éléments du reporting masqués à ce membre sur ce dossier. */
  masquesReporting: string[];
  hasReporting: boolean;
}

const CLIENT_TABS = [
  { id: "overview", label: "Synthèse Financière", icon: PiChartScatterDuotone },
  { id: "chiffres", label: "Chiffres d'affaires", icon: PiCoinsDuotone },
  { id: "resultats", label: "Résultats", icon: PiChartDonutDuotone },
  { id: "recouvrement", label: "Recouvrement Clients", icon: PiHandCoinsDuotone },
  { id: "dettes", label: "Règlement Fournisseurs", icon: PiScalesDuotone },
  { id: "dettes-ct", label: "Dettes court terme", icon: PiMoneyWavyDuotone },
  { id: "tresorerie", label: "Trésorerie", icon: PiWalletDuotone },
  { id: "dettes-fi", label: "Dettes Financières", icon: PiBankDuotone },
  { id: "ratios", label: "Ratios bilantiels", icon: PiPercentDuotone },
  { id: "etats", label: "États Financiers", icon: PiFileTextDuotone },
  { id: "bilan", label: "Bilan d'activité", icon: PiBookOpenDuotone },
  { id: "members", label: "Membres", icon: PiUsersThreeDuotone },
  {
    id: "declaration",
    label: "Import",
    icon: PiUploadSimpleDuotone,
  },
  { id: "saisie", label: "Comptabilité", icon: PiNotePencilDuotone },
  { id: "files", label: "Autres Fichiers", icon: PiFilesDuotone },
];

// Onglets regroupés dans l'accordéon « Reporting financier » de la
// navigation ; les suivants (Membres, Import, Comptabilité, Autres fichiers)
// viennent après un séparateur.
const GROUPE_REPORTING = new Set([
  "overview",
  "chiffres",
  "resultats",
  "recouvrement",
  "dettes",
  "dettes-ct",
  "tresorerie",
  "dettes-fi",
  "ratios",
  "etats",
  "bilan",
]);

// Onglets de reporting financier qui dépendent de la présence d'au moins
// un reporting. Ils sont grisés tant qu'aucun reporting n'existe.
const REPORTING_TAB_IDS = new Set([
  "chiffres",
  "resultats",
  "recouvrement",
  "dettes",
  "dettes-ct",
  "tresorerie",
  "dettes-fi",
  "ratios",
  "etats",
  "bilan",
  "saisie",
]);

// Onglets de SOLDES (encours lus depuis l'ouverture de l'exercice) : la
// période part toujours du premier mois couvert, seule la fin se règle.
// Les autres onglets (Synthèse, Chiffres d'affaires, Résultats, États
// financiers) portent des flux : début et fin se règlent.
const ONGLETS_SOLDES = new Set([
  "recouvrement",
  "dettes",
  "dettes-ct",
  "tresorerie",
  "dettes-fi",
  "ratios",
  "bilan",
]);

// Onglets désactivés de manière permanente (fonctionnalité à venir).
const DISABLED_TAB_IDS = new Set(["files"]);

export default function ClientDetailsClient({
  session,
  initialClient,
  canEdit,
  canDelete,
  canViewFiles,
  canDeleteFiles,
  canViewMembers,
  canViewReporting,
  canExportReporting,
  masquesReporting,
  hasReporting,
}: ClientDetailsClientProps) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Onglets proposés à ce membre : matrice des droits (reporting, membres), puis
  // éléments masqués (un onglet sans aucun élément visible disparaît).
  const ongletsPermis = useMemo(() => {
    const masques = new Set(masquesReporting);
    return CLIENT_TABS.filter((t) => {
      if (GROUPE_REPORTING.has(t.id)) return canViewReporting && ongletVisible(t.id, masques);
      if (t.id === "members") return canViewMembers;
      return canViewFiles; // Import, Comptabilité, Autres fichiers
    });
  }, [masquesReporting, canViewReporting, canViewMembers, canViewFiles]);
  // Premier onglet utilisable : celui qui s'ouvre, et le repli d'un onglet interdit.
  const ongletParDefaut = (
    ongletsPermis.find(
      (t) =>
        !DISABLED_TAB_IDS.has(t.id) && (hasReporting || !REPORTING_TAB_IDS.has(t.id)),
    ) ?? CLIENT_TABS[0]
  ).id;
  const [activeTab, setActiveTab] = useState(ongletParDefaut);
  // Accordéon « Reporting financier » de la navigation : ouvert par défaut.
  const [reportingOuvert, setReportingOuvert] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Exclusion des écritures saisies de TOUS les calculs du reporting (avant/après).
  const [excludeManual, setExcludeManual] = useState<boolean>(
    !!initialClient?.excludeManualEntries,
  );
  const [togglingManual, setTogglingManual] = useState(false);
  // Incrémenté pour forcer le rechargement des données de l'onglet courant
  // (remontage du contenu) sans quitter l'onglet ni perdre les filtres.
  const [versionDonnees, setVersionDonnees] = useState(0);

  const toggleExcludeManual = async (next: boolean) => {
    setTogglingManual(true);
    setExcludeManual(next);
    try {
      const res = await fetch(`/api/clients/${client.id}/reporting-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeManualEntries: next }),
      });
      if (!res.ok) {
        setExcludeManual(!next);
        setError("Impossible de mettre à jour l'inclusion des saisies.");
        return;
      }
      // Recharger les données pour refléter l'avant/après, en restant sur
      // l'onglet en cours (un rechargement complet ramenait à la Synthèse).
      setVersionDonnees((v) => v + 1);
      router.refresh();
    } catch {
      setExcludeManual(!next);
      setError("Erreur réseau.");
    } finally {
      setTogglingManual(false);
    }
  };

  // ===== Filtre de période partagé par tous les onglets de reporting :
  // l'année, puis les mois de début et de fin (curseur sur les mois couverts).
  // Plus de mode « périodique » ou « cumulé » : un seul mois = ce mois, jour
  // par jour ; plusieurs mois = leur somme. =====
  const [annees, setAnnees] = useState<AnneeReporting[] | null>(null);
  const [periode, setPeriode] = useState<Periode | null>(null);

  // Exercices et mois importés ; relus au rafraîchissement (nouvel import).
  useEffect(() => {
    if (!hasReporting || !canViewReporting) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${client.id}/reporting/periodes`);
        if (!res.ok) throw new Error("Périodes indisponibles");
        const json = (await res.json()) as { annees: AnneeReporting[] };
        if (annule) return;
        setAnnees(json.annees);
        // Par défaut : l'exercice le plus récent, tous ses mois. Une période
        // déjà choisie est gardée si elle existe encore.
        setPeriode((p) => {
          const a = p && json.annees.find((x) => String(x.annee) === p.annee);
          if (a) return periodeSurAnnee(a, p);
          return json.annees[0] ? periodeSurAnnee(json.annees[0]) : null;
        });
      } catch (e) {
        console.error(e);
        if (!annule) setAnnees([]);
      }
    })();
    return () => {
      annule = true;
    };
  }, [client.id, hasReporting, canViewReporting, versionDonnees]);

  const finSeule = ONGLETS_SOLDES.has(activeTab);
  const anneeCourante = annees?.find((a) => String(a.annee) === periode?.annee);
  const premierMois = anneeCourante?.mois[0] ?? "01";
  // Valeurs transmises aux onglets (mêmes noms qu'avant) : année, mois de fin
  // (`selectedMonth`) et de début (`startMonth`). `periodType` garde les
  // conventions des API : « month » = un seul mois (jour par jour), « ytd » =
  // du mois de début au mois de fin.
  const year = periode?.annee ?? String(new Date().getFullYear());
  const selectedMonth = periode?.fin ?? "12";
  const debutChoisi = finSeule ? premierMois : (periode?.debut ?? premierMois);
  const periodType: "month" | "ytd" =
    !finSeule && debutChoisi === selectedMonth ? "month" : "ytd";
  // Début transmis aux API de flux : « 01 » quand la période part du premier
  // mois importé, pour garder les écritures saisies avant l'import (comme
  // auparavant) ; sinon le mois choisi.
  const startMonth = debutChoisi === premierMois ? "01" : debutChoisi;
  const cumulGranularity = "mois" as const;

  // Les API se calent sur un exercice ou un mois réellement importés : le
  // filtre suit (l'année garde ses mois si elle les couvre).
  const setYear = useCallback(
    (y: string) => {
      setPeriode((p) => {
        if (p?.annee === y) return p;
        const a = annees?.find((x) => String(x.annee) === y);
        return a ? periodeSurAnnee(a, p ?? undefined) : p;
      });
    },
    [annees],
  );
  const setSelectedMonth = useCallback((m: string) => {
    setPeriode((p) =>
      !p || p.fin === m ? p : { ...p, fin: m, debut: p.debut > m ? m : p.debut },
    );
  }, []);
  // Le mode et la granularité n'existent plus : les onglets n'en changent pas.
  const sansEffet = useCallback(() => {}, []);

  // Sur un onglet de soldes, le curseur ne règle que la fin : le début choisi
  // pour les onglets de flux est conservé.
  const changerPeriode = useCallback(
    (p: Periode) => {
      setPeriode((prev) =>
        finSeule && prev && prev.annee === p.annee
          ? { ...p, debut: prev.debut > p.fin ? p.fin : prev.debut }
          : p,
      );
    },
    [finSeule],
  );

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  // Si l'utilisateur tente d'accéder à un onglet grisé ou interdit (par exemple
  // via l'URL), on le ramène automatiquement sur le premier onglet utilisable.
  useEffect(() => {
    if (
      DISABLED_TAB_IDS.has(activeTab) ||
      (!hasReporting && REPORTING_TAB_IDS.has(activeTab)) ||
      !ongletsPermis.some((t) => t.id === activeTab)
    ) {
      setActiveTab(ongletParDefaut);
    }
  }, [hasReporting, activeTab, ongletsPermis, ongletParDefaut]);

  return (
    <DashboardLayout>
      <div className="h-screen flex overflow-hidden">
        {/* ===== LEFT: Locked nav column ===== */}
        <aside className="w-[260px] shrink-0 border-r border-[#D0E3F5] flex flex-col px-6 py-6 overflow-y-auto">
          {/* Rafraîchir : en tête de colonne. Recharge les données de l'onglet
              en cours (remontage) et celles du serveur. */}
          <button
            type="button"
            onClick={() => {
              setVersionDonnees((v) => v + 1);
              router.refresh();
            }}
            className="mb-3 flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-[#335890] hover:bg-[#EBF5FF] hover:text-[#0077C3] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Rafraîchir
          </button>

          {/* Client Info */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#EBF5FF] flex items-center justify-center text-xl font-bold text-[#0077C3] shrink-0">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[#00122E] truncate">
                {client.name}
              </h1>
              <p className="text-xs text-[#335890] truncate">{client.email}</p>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {client.denomination && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {client.denomination}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {client.companyType}
                </Badge>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {(() => {
              // Un onglet de la navigation (reporting ou non).
              const onglet = (tab: (typeof CLIENT_TABS)[number], dansGroupe: boolean) => {
                const active = activeTab === tab.id;
                const permanentlyDisabled = DISABLED_TAB_IDS.has(tab.id);
                const disabled =
                  permanentlyDisabled ||
                  (REPORTING_TAB_IDS.has(tab.id) && !hasReporting);
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (disabled) return;
                      setActiveTab(tab.id);
                    }}
                    disabled={disabled}
                    title={
                      permanentlyDisabled
                        ? "Bientôt disponible"
                        : disabled
                          ? "Créez d'abord un reporting financier pour activer cet onglet"
                          : undefined
                    }
                    aria-disabled={disabled}
                    className={`flex items-center gap-3 w-full text-left leading-tight ${dansGroupe ? "px-3 py-2.5" : "px-4 py-3"} rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#0077C3] text-white"
                        : disabled
                          ? "text-[#94A3B8] cursor-not-allowed opacity-60"
                          : "text-[#335890] hover:bg-[#EBF5FF] hover:text-[#0077C3]"
                    }`}
                  >
                    <tab.icon className="w-5 h-5 shrink-0" />
                    {tab.label}
                  </button>
                );
              };

              const ongletsReporting = ongletsPermis.filter((t) => GROUPE_REPORTING.has(t.id));
              const autresOnglets = ongletsPermis.filter((t) => !GROUPE_REPORTING.has(t.id));
              // Replié, l'en-tête signale qu'un onglet du groupe est affiché.
              const groupeActif = GROUPE_REPORTING.has(activeTab);

              return (
                <>
                  {ongletsReporting.length > 0 && (
                    <>
                    {/* Accordéon « Reporting financier » */}
                    <button
                      type="button"
                      onClick={() => setReportingOuvert((o) => !o)}
                      aria-expanded={reportingOuvert}
                      aria-controls="nav-reporting-financier"
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left text-sm font-semibold transition-colors ${
                        !reportingOuvert && groupeActif
                          ? "bg-[#EBF5FF] text-[#0077C3]"
                          : "text-[#00122E] hover:bg-[#EBF5FF] hover:text-[#0077C3]"
                      }`}
                    >
                      <PiPresentationChartDuotone className="w-5 h-5 shrink-0" />
                      <span className="flex-1">Reporting financier</span>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 transition-transform duration-200 ${reportingOuvert ? "rotate-180" : ""}`}
                      />
                    </button>
                    <div
                      id="nav-reporting-financier"
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                        reportingOuvert ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="ml-4 space-y-1 border-l border-[#D0E3F5] pl-2 py-1">
                          {ongletsReporting.map((tab) => onglet(tab, true))}
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-[#D0E3F5] my-2" />
                    </>
                  )}

                  {autresOnglets.map((tab) => onglet(tab, false))}
                </>
              );
            })()}
          </nav>
        </aside>

        {/* ===== RIGHT: Scrollable content ===== */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-8 py-6">
            {/* Top bar: title + user */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-[#00122E]">
                  {CLIENT_TABS.find((t) => t.id === activeTab)?.label ||
                    "Synthèse Financière"}
                </h2>
                {/* Sous le titre : retour à la liste et devise des montants. */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href="/clients"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium bg-[#EBF5FF] text-[#335890] border border-[#D0E3F5] hover:bg-[#D0E3F5] transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour aux clients
                  </Link>
                  <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm bg-[#F5F9FF] border border-[#D0E3F5]">
                    <span className="text-[10px] text-[#94A3B8] uppercase">Devise</span>
                    <span className="font-semibold text-[#00122E]">{DEVISE}</span>
                    <span className="text-xs text-[#335890]">(unité : {UNITE_ABREGEE})</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-[#335890]">Utilisateur</p>
                  <p className="text-sm font-semibold text-[#00122E]">
                    {session.user.firstName && session.user.lastName
                      ? `${session.user.firstName} ${session.user.lastName}`
                      : session.user.name || session.user.email}
                  </p>
                  <Badge
                    variant={roleBadgeVariant as any}
                    className="text-xs mt-0.5"
                  >
                    {roleLabel}
                  </Badge>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center overflow-hidden">
                  <Users className="w-5 h-5 text-[#0077C3]" />
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 mb-6">
              {hasReporting && canViewReporting && (
                <div
                  className="flex items-center gap-2 rounded-full border border-[#D0E3F5] px-4 h-9"
                  title="Inclure les écritures saisies de l'utilisateur dans tous les calculs du reporting (désactivé = masquées)"
                >
                  <span className="text-xs text-[#335890] whitespace-nowrap">
                    Prendre en compte les saisies
                  </span>
                  <Switch
                    checked={!excludeManual}
                    onCheckedChange={(v) => toggleExcludeManual(!v)}
                    disabled={togglingManual}
                    aria-label="Prendre en compte les saisies utilisateur dans le reporting"
                  />
                </div>
              )}

              {canDelete && !client.isSelfEntity && (
                <Button
                  variant="outline"
                  className="gap-2 border-red-200 text-red-500 hover:bg-red-50 rounded-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
              )}

              {canEdit && !client.isSelfEntity && (
                <Button
                  variant="outline"
                  className="gap-2 border-[#D0E3F5] text-[#335890] rounded-full"
                  onClick={() => setShowEditDialog(true)}
                >
                  <Edit className="w-4 h-4" />
                  Modifier
                </Button>
              )}

              <Button
                onClick={() => setShowUploadDialog(true)}
                className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
              >
                <Plus className="w-4 h-4" />
                Importer documents
              </Button>
            </div>

            {/* Le membre sait que son administrateur a restreint son accès. */}
            {GROUPE_REPORTING.has(activeTab) && masquesReporting.length > 0 && (
              <p className="flex items-center gap-2 mb-4 text-xs text-[#335890]">
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
                Certains éléments de ce dossier sont masqués pour votre profil par un administrateur.
              </p>
            )}

            {GROUPE_REPORTING.has(activeTab) &&
              hasReporting &&
              periode &&
              annees &&
              annees.length > 0 && (
                <div className="mb-6">
                  <FiltrePeriode
                    annees={annees}
                    valeur={finSeule ? { ...periode, debut: premierMois } : periode}
                    finSeule={finSeule}
                    onChange={changerPeriode}
                  />
                </div>
              )}

            <VisibiliteProvider masques={masquesReporting} peutExporter={canExportReporting}>
            {/* Les onglets de reporting attendent la période (exercices importés). */}
            {GROUPE_REPORTING.has(activeTab) && hasReporting && canViewReporting && annees === null ? (
              <div className="flex items-center justify-center h-64 text-sm text-[#335890]">
                Chargement des périodes…
              </div>
            ) : (
            <div className="min-w-0" key={versionDonnees}>
              {/* Onglets financiers — instance unique pour préserver les filtres
                entre Synthèse / Chiffres / Résultats. Recouvrement a ses
                propres filtres internes. */}
              {(() => {
                const map: Record<
                  string,
                  | "synthese"
                  | "chiffre-affaires"
                  | "resultat"
                  | "recouvrement"
                  | undefined
                > = {
                  overview: "synthese",
                  chiffres: "chiffre-affaires",
                  resultats: "resultat",
                  recouvrement: "recouvrement",
                };
                const internalTab = map[activeTab];
                if (!internalTab) return null;

                // Aucun reporting créé pour le client : on masque tous les
                // onglets de reporting (Synthèse / Chiffres / Résultats /
                // Recouvrement) au profit d'un empty state qui invite à
                // créer un reporting. Les autres onglets sont par ailleurs
                // grisés dans la nav.
                if (!hasReporting) {
                  return (
                    <Card className="p-12 border-[#D0E3F5] text-center">
                      <div className="mx-auto w-14 h-14 rounded-full bg-[#EBF5FF] flex items-center justify-center mb-4">
                        <Plus className="w-6 h-6 text-[#0077C3]" />
                      </div>
                      <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                        Aucun reporting financier
                      </h3>
                      <p className="text-sm text-[#335890] mb-6">
                        Créez un premier reporting pour visualiser la synthèse,
                        le chiffre d&apos;affaires et les résultats de ce
                        client.
                      </p>
                      <Button
                        onClick={() => setShowUploadDialog(true)}
                        className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
                      >
                        <Plus className="w-4 h-4" />
                        Importer documents
                      </Button>
                    </Card>
                  );
                }

                return (
                  <ClientReportingChart
                    clientId={client.id}
                    activeTab={internalTab}
                    hideNav
                    startMonth={startMonth}
                    year={year}
                    setYear={setYear}
                    periodType={periodType}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                );
              })()}

              {/* Dettes — composant dédié, partage les mêmes filtres que les
                  autres onglets reporting via les props ci-dessous. */}
              {activeTab === "dettes" &&
                (hasReporting ? (
                  <ClientDettesTab
                    clientId={client.id}
                    year={year}
                    setYear={setYear}
                    periodType={periodType}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-[#EBF5FF] flex items-center justify-center mb-4">
                      <Plus className="w-6 h-6 text-[#0077C3]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890] mb-6">
                      Créez un premier reporting pour visualiser les dettes de
                      ce client.
                    </p>
                    <Button
                      onClick={() => setShowUploadDialog(true)}
                      className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
                    >
                      <Plus className="w-4 h-4" />
                      Importer documents
                    </Button>
                  </Card>
                ))}

              {/* Bilan — composant dédié minimaliste, partage les mêmes
                  filtres que les autres onglets reporting via les props
                  ci-dessous. Contenu à enrichir ultérieurement. */}
              {activeTab === "dettes-ct" &&
                (hasReporting ? (
                  <ClientDettesCourtTermeTab
                    clientId={client.id}
                    year={year}
                    setYear={setYear}
                    periodType={periodType}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890]">
                      Importez un grand livre pour analyser les dettes court terme.
                    </p>
                  </Card>
                ))}

              {activeTab === "tresorerie" &&
                (hasReporting ? (
                  <ClientTresorerieTab
                    clientId={client.id}
                    year={year}
                    setYear={setYear}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890]">
                      Importez un grand livre pour analyser la trésorerie.
                    </p>
                  </Card>
                ))}

              {activeTab === "dettes-fi" &&
                (hasReporting ? (
                  <ClientDettesFinancieresTab
                    clientId={client.id}
                    year={year}
                    setYear={setYear}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890]">
                      Importez un grand livre pour analyser les dettes financières.
                    </p>
                  </Card>
                ))}

              {activeTab === "ratios" &&
                (hasReporting ? (
                  <ClientRatiosTab
                    clientId={client.id}
                    year={year}
                    setYear={setYear}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890]">
                      Importez un grand livre pour calculer les ratios bilantiels.
                    </p>
                  </Card>
                ))}

              {activeTab === "etats" &&
                (hasReporting ? (
                  <ClientEtatsFinanciersTab
                    clientId={client.id}
                    startMonth={startMonth}
                    year={year}
                    setYear={setYear}
                    periodType={periodType}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890]">
                      Importez un grand livre pour générer les états financiers.
                    </p>
                  </Card>
                ))}

              {activeTab === "bilan" &&
                (hasReporting ? (
                  <ClientBilanTab
                    clientId={client.id}
                    year={year}
                    setYear={setYear}
                    periodType={periodType}
                    setPeriodType={sansEffet}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    cumulGranularity={cumulGranularity}
                    setCumulGranularity={sansEffet}
                  />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-[#EBF5FF] flex items-center justify-center mb-4">
                      <Plus className="w-6 h-6 text-[#0077C3]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun reporting financier
                    </h3>
                    <p className="text-sm text-[#335890] mb-6">
                      Créez un premier reporting pour visualiser le bilan de ce
                      client.
                    </p>
                    <Button
                      onClick={() => setShowUploadDialog(true)}
                      className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
                    >
                      <Plus className="w-4 h-4" />
                      Importer documents
                    </Button>
                  </Card>
                ))}

              {/* Members */}
              {activeTab === "members" && (
                <MembresTab clientId={client.id} clientName={client.name} />
              )}

              {/* Reporting Financier */}
              {activeTab === "declaration" && (
                <Tabs value="declaration">
                  <DeclarationTabs clientId={client.id} canDeleteFiles={canDeleteFiles} />
                </Tabs>
              )}

              {/* Saisie — lignes comptables manuelles */}
              {activeTab === "saisie" &&
                (hasReporting ? (
                  <SaisieTab clientId={client.id} />
                ) : (
                  <Card className="p-12 border-[#D0E3F5] text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-[#EBF5FF] flex items-center justify-center mb-4">
                      <Plus className="w-6 h-6 text-[#0077C3]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#00122E] mb-1">
                      Aucun grand livre importé
                    </h3>
                    <p className="text-sm text-[#335890] mb-6">
                      Importez d&apos;abord un reporting pour saisir des lignes
                      comptables.
                    </p>
                    <Button
                      onClick={() => setShowUploadDialog(true)}
                      className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
                    >
                      <Plus className="w-4 h-4" />
                      Importer documents
                    </Button>
                  </Card>
                ))}

              {/* Files */}
              {activeTab === "files" && (
                <FilesTabs clientId={client.id} canDeleteFiles={canDeleteFiles} />
              )}
            </div>
            )}
            </VisibiliteProvider>
          </div>
        </main>
      </div>

      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        client={{ id: client.id, name: client.name, email: client.email }}
      />

      <ClientDetailsDialog
        client={client}
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      <DeleteClientDialog
        client={showDeleteDialog ? client : null}
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      />

    </DashboardLayout>
  );
}
