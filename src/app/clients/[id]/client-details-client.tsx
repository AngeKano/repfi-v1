"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Edit,
  Trash2,
  Users,
  UserPlus,
  Plus,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import {
  PiChartScatterDuotone,
  PiCoinsDuotone,
  PiChartDonutDuotone,
  PiHandCoinsDuotone,
  PiUsersThreeDuotone,
  PiChartBarHorizontalDuotone,
  PiFilesDuotone,
} from "react-icons/pi";
import Link from "next/link";
import FilesTabs from "./files-tabs";
import DeclarationTabs from "./declaration/declaration-tabs";
import ClientReportingChart from "@/components/reporting/client-reporting-chart";
import { UploadFileDialog } from "./upload-file-dialog";
import { ClientDetailsDialog } from "@/app/clients/client-details-dialog";
import { DeleteClientDialog } from "@/app/clients/delete-client-dialog";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { DashboardLayout } from "@/components/dashboard-layout";

interface ClientDetailsClientProps {
  session: any;
  initialClient: any;
  canEdit: boolean;
  canDelete: boolean;
  canAssignMembers: boolean;
}

const CLIENT_TABS = [
  { id: "overview", label: "Synthèse Financière", icon: PiChartScatterDuotone },
  { id: "chiffres", label: "Chiffres d'affaires", icon: PiCoinsDuotone },
  { id: "resultats", label: "Résultats", icon: PiChartDonutDuotone },
  { id: "recouvrement", label: "Recouvrement", icon: PiHandCoinsDuotone },
  { id: "members", label: "Membres", icon: PiUsersThreeDuotone },
  { id: "declaration", label: "Reporting Financier", icon: PiChartBarHorizontalDuotone },
  { id: "files", label: "Autres Fichiers", icon: PiFilesDuotone },
];

export default function ClientDetailsClient({
  session,
  initialClient,
  canEdit,
  canDelete,
  canAssignMembers,
}: ClientDetailsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [client, setClient] = useState(initialClient);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const initialPeriodType = (() => {
    const qp = searchParams.get("periodType");
    if (qp === "year" || qp === "month" || qp === "ytd") return qp;
    return undefined;
  })();

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);


  return (
    <DashboardLayout>
      <div className="h-screen flex overflow-hidden">
        {/* ===== LEFT: Locked nav column ===== */}
        <aside className="w-[260px] shrink-0 border-r border-[#D0E3F5] flex flex-col px-6 py-6 overflow-y-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="rounded-full bg-[#EBF5FF] text-[#335890] border-[#D0E3F5] hover:bg-[#D0E3F5] w-fit mb-6"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraichir
          </Button>

          {/* Client Info */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#EBF5FF] flex items-center justify-center text-xl font-bold text-[#0077C3] shrink-0">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[#00122E] truncate">{client.name}</h1>
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
              {CLIENT_TABS.map((tab, idx) => {
                const active = activeTab === tab.id;
                // Separator before "Membres" (index 4)
                const showSeparator = idx === 4;
                return (
                  <div key={tab.id}>
                    {showSeparator && (
                      <div className="h-px bg-[#D0E3F5] my-2" />
                    )}
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-[#0077C3] text-white"
                          : "text-[#335890] hover:bg-[#EBF5FF] hover:text-[#0077C3]"
                      }`}
                    >
                      <tab.icon className="w-5 h-5" />
                      {tab.label}
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* Currency info */}
            <div className="mt-6 px-4 py-3 bg-[#F5F9FF] rounded-lg border border-[#D0E3F5]">
              <p className="text-[10px] text-[#94A3B8] uppercase mb-0.5">
                Devise
              </p>
              <p className="text-sm font-semibold text-[#00122E]">
                FCFA{" "}
                <span className="text-xs font-normal text-[#335890]">
                  (unité : K FCFA)
                </span>
              </p>
            </div>

            <div className="mt-4">
              <Link href="/clients">
                <button className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-[#335890] hover:bg-[#EBF5FF] hover:text-[#0077C3] transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                  Retour aux clients
                </button>
              </Link>
            </div>
        </aside>

        {/* ===== RIGHT: Scrollable content ===== */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-8 py-6">
            {/* Top bar: title + user */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#00122E]">
                {CLIENT_TABS.find((t) => t.id === activeTab)?.label || "Synthèse Financière"}
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-[#335890]">Utilisateur</p>
                  <p className="text-sm font-semibold text-[#00122E]">
                    {session.user.firstName && session.user.lastName
                      ? `${session.user.firstName} ${session.user.lastName}`
                      : session.user.name || session.user.email}
                  </p>
                  <Badge variant={roleBadgeVariant as any} className="text-xs mt-0.5">
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
                Créer un reporting
              </Button>
            </div>

          <div className="min-w-0">
            {/* Onglets financiers — instance unique pour préserver les filtres
                entre Synthèse / Chiffres / Résultats. Recouvrement a ses
                propres filtres internes. */}
            {(() => {
              const map: Record<string, "synthese" | "chiffre-affaires" | "resultat" | "recouvrement" | undefined> = {
                overview: "synthese",
                chiffres: "chiffre-affaires",
                resultats: "resultat",
                recouvrement: "recouvrement",
              };
              const internalTab = map[activeTab];
              if (!internalTab) return null;
              return (
                <ClientReportingChart
                  clientId={client.id}
                  activeTab={internalTab}
                  initialPeriodType={initialPeriodType}
                  hideNav
                />
              );
            })()}

            {/* Members */}
            {activeTab === "members" && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-[#00122E]">
                    Membres assignés
                  </h2>
                  {canAssignMembers && (
                    <Link href={`/clients/${client.id}/assign`}>
                      <Button size="sm" className="gap-2">
                        <UserPlus className="w-4 h-4" />
                        Gérer les membres
                      </Button>
                    </Link>
                  )}
                </div>

                {client.assignedMembers && client.assignedMembers.length > 0 ? (
                  <div className="border border-[#D0E3F5] rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase">
                            Membre
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase">
                            Email
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase">
                            Rôle
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {client.assignedMembers.map((member: any, idx: number) => (
                          <tr
                            key={member.id}
                            className={`border-b border-[#D0E3F5] last:border-b-0 ${
                              idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3]">
                                  {member.firstName
                                    ? member.firstName.charAt(0).toUpperCase()
                                    : member.email.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-[#00122E]">
                                  {member.firstName && member.lastName
                                    ? `${member.firstName} ${member.lastName}`
                                    : member.email}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-[#335890]">
                              {member.email}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={getRoleBadgeVariant(member.role) as any}
                                className="text-xs"
                              >
                                {getRoleLabel(member.role)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-[#D0E3F5] mx-auto mb-3" />
                    <p className="text-[#335890]">Aucun membre assigné</p>
                    {canAssignMembers && (
                      <Link href={`/clients/${client.id}/assign`}>
                        <Button variant="outline" className="mt-4 gap-2">
                          <UserPlus className="w-4 h-4" />
                          Assigner des membres
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* Reporting Financier */}
            {activeTab === "declaration" && (
              <Tabs value="declaration">
                <DeclarationTabs clientId={client.id} />
              </Tabs>
            )}

            {/* Files */}
            {activeTab === "files" && <FilesTabs clientId={client.id} />}
          </div>
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
