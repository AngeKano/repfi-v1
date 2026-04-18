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
  BarChart3,
  DollarSign,
  Target,
  Receipt,
  FileText,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import FilesTabs from "./files-tabs";
import DeclarationTabs from "./declaration/declaration-tabs";
import ClientReportingChart from "@/components/reporting/client-reporting-chart";
import { UploadFileDialog } from "./upload-file-dialog";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface ClientDetailsClientProps {
  session: any;
  initialClient: any;
  canEdit: boolean;
  canDelete: boolean;
  canAssignMembers: boolean;
}

const CLIENT_TABS = [
  { id: "overview", label: "Synthèse Financière", icon: BarChart3 },
  { id: "chiffres", label: "Chiffres d'affaires", icon: DollarSign },
  { id: "resultats", label: "Résultats", icon: Target },
  { id: "recouvrement", label: "Recouvrement", icon: Receipt },
  { id: "members", label: "Membres", icon: Users },
  { id: "declaration", label: "Reporting Financier", icon: FileText },
  // { id: "files", label: "Autres Fichiers", icon: FileText },
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const initialPeriodType = (() => {
    const qp = searchParams.get("periodType");
    if (qp === "year" || qp === "month" || qp === "ytd") return qp;
    return undefined;
  })();

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  const handleDelete = async () => {
    setLoading(true);
    setError("");
    setShowDeleteConfirm(false);

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      router.push("/clients");
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression");
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="text-[#0077C3] border-[#0077C3] hover:bg-[#EBF5FF]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraichir
          </Button>

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

        {/* Client Info Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#EBF5FF] flex items-center justify-center text-2xl font-bold text-[#0077C3]">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#00122E]">{client.name}</h1>
              <p className="text-sm text-[#335890]">{client.email}</p>
              <div className="flex items-center gap-2 mt-1">
                {client.denomination && (
                  <Badge variant="outline" className="text-xs">
                    {client.denomination}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {client.companyType}
                </Badge>
                <Badge
                  className="text-xs bg-[#DCFCE7] text-[#16A34A] hover:bg-[#DCFCE7]"
                >
                  Actif
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canDelete && !client.isSelfEntity && (
              <Button
                variant="outline"
                className="gap-2 border-red-200 text-red-500 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4" />
                Supprimer
              </Button>
            )}

            {canEdit && !client.isSelfEntity && (
              <Link href={`/clients/${client.id}/edit`}>
                <Button variant="outline" className="gap-2 border-[#D0E3F5] text-[#335890]">
                  <Edit className="w-4 h-4" />
                  Modifier
                </Button>
              </Link>
            )}

            <Button
              onClick={() => setShowUploadDialog(true)}
              className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]"
            >
              <Plus className="w-4 h-4" />
              Charger un fichier
            </Button>
          </div>
        </div>

        {/* Main Layout: Sidebar + Content */}
        <div className="flex gap-6">
          {/* Left Sidebar Navigation */}
          <div className="w-[220px] shrink-0">
            <nav className="space-y-1">
              {CLIENT_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
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
                );
              })}
            </nav>

            <div className="mt-8">
              <Link href="/clients">
                <button className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-[#335890] hover:bg-[#EBF5FF] hover:text-[#0077C3] transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                  Retour aux clients
                </button>
              </Link>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Financial tabs - delegated to ClientReportingChart */}
            {activeTab === "overview" && (
              <ClientReportingChart
                clientId={client.id}
                initialTab="synthese"
                initialPeriodType={initialPeriodType}
                hideNav
              />
            )}

            {activeTab === "chiffres" && (
              <ClientReportingChart
                clientId={client.id}
                initialTab="chiffre-affaires"
                initialPeriodType={initialPeriodType}
                hideNav
              />
            )}

            {activeTab === "resultats" && (
              <ClientReportingChart
                clientId={client.id}
                initialTab="resultat"
                initialPeriodType={initialPeriodType}
                hideNav
              />
            )}

            {activeTab === "recouvrement" && (
              <ClientReportingChart
                clientId={client.id}
                initialTab="recouvrement"
                initialPeriodType={initialPeriodType}
                hideNav
              />
            )}

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

            {/* Declaration / Reporting Financier */}
            {activeTab === "declaration" && (
              <Tabs value="declaration">
                <DeclarationTabs clientId={client.id} />
              </Tabs>
            )}

            {/* Files */}
            {activeTab === "files" && <FilesTabs clientId={client.id} />}
          </div>
        </div>
      </div>

      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        client={{ id: client.id, name: client.name, email: client.email }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Attention"
        message={`Êtes-vous sûr de vouloir supprimer le client "${client.name}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        confirmIcon={<Trash2 className="w-4 h-4" />}
      />
    </DashboardLayout>
  );
}
