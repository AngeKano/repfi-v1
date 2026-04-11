"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Users,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  BarChart3,
  RefreshCw,
  Download,
} from "lucide-react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { ClientDetailsDialog } from "./client-details-dialog";
import {
  ReportingParamsDialog,
  paramsToQuery,
} from "./reporting-params-dialog";

const COMPANY_TYPES = [
  { value: "", label: "Tous les types" },
  { value: "TECHNOLOGIE", label: "Technologie" },
  { value: "FINANCE", label: "Finance" },
  { value: "SANTE", label: "Santé" },
  { value: "EDUCATION", label: "Éducation" },
  { value: "COMMERCE", label: "Commerce" },
  { value: "INDUSTRIE", label: "Industrie" },
  { value: "AGRICULTURE", label: "Agriculture" },
  { value: "IMMOBILIER", label: "Immobilier" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "ENERGIE", label: "Énergie" },
  { value: "TELECOMMUNICATION", label: "Télécommunication" },
  { value: "TOURISME", label: "Tourisme" },
];

interface ClientsListClientProps {
  session: any;
  initialClients: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  initialSearch: string;
  initialType: string;
  canCreateClient: boolean;
}

export default function ClientsListClient({
  session,
  initialClients,
  pagination,
  initialSearch,
  initialType,
  canCreateClient,
}: ClientsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [companyType, setCompanyType] = useState(initialType);
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsClient, setDetailsClient] = useState<any | null>(null);
  const [reportingClient, setReportingClient] = useState<any | null>(null);

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    if (companyType) {
      params.set("type", companyType);
    } else {
      params.delete("type");
    }
    router.push(`/clients?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/clients?${params.toString()}`);
  };

  const getCompanyTypeLabel = (type: string) => {
    return COMPANY_TYPES.find((t) => t.value === type)?.label || type;
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === initialClients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(initialClients.map((c) => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const total = pagination.totalPages;
    const current = pagination.page;

    if (total <= 5) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push("...");
      for (
        let i = Math.max(2, current - 1);
        i <= Math.min(total - 1, current + 1);
        i++
      ) {
        pages.push(i);
      }
      if (current < total - 2) pages.push("...");
      pages.push(total);
    }
    return pages;
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="text-[#0077C3] border-[#0077C3] hover:bg-[#EBF5FF]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraichir
          </Button>

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

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-[#00122E]">Clients</h1>

          <div className="flex items-center gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <Input
                placeholder="Recherche"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 w-[220px] bg-[#F8FAFC] border-[#E2E8F0]"
              />
            </form>

            {/* <Button variant="outline" className="h-10 gap-2 border-[#0077C3] text-[#0077C3]">
              <Download className="w-4 h-4" />
              Exporter
            </Button> */}

            {canCreateClient && (
              <Link href="/clients/new">
                <Button className="h-10 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]">
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau client
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mb-6 border-b border-[#D0E3F5]">
          <button
            onClick={() => setActiveTab("active")}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === "active"
                ? "text-[#0077C3]"
                : "text-[#335890] hover:text-[#0077C3]"
            }`}
          >
            Clients actifs ({pagination.total})
            {activeTab === "active" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("deleted")}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === "deleted"
                ? "text-[#0077C3]"
                : "text-[#335890] hover:text-[#0077C3]"
            }`}
          >
            Clients Supprimés (0)
            {activeTab === "deleted" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
        </div>

        {/* Clients Table */}
        {initialClients.length === 0 ? (
          <div className="text-center py-16 border border-[#D0E3F5] rounded-xl bg-white">
            <Users className="w-16 h-16 text-[#D0E3F5] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#00122E] mb-2">
              Aucun client trouvé
            </h3>
            <p className="text-[#335890] mb-6">
              {search || companyType
                ? "Essayez de modifier vos critères de recherche"
                : "Commencez par créer votre premier client"}
            </p>
            {canCreateClient && (
              <Link href="/clients/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer un client
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === initialClients.length && initialClients.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-[#D0E3F5] text-[#0077C3] focus:ring-[#0077C3]"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Nom du client
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Type d&apos;entreprise
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Membres
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Fichiers
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Date d&apos;ajout
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Dénomination
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialClients.map((client, idx) => (
                  <tr
                    key={client.id}
                    className={`border-b border-[#D0E3F5] last:border-b-0 hover:bg-[#F5F9FF] transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                    }`}
                  >
                    <td className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(client.id)}
                        onChange={() => toggleSelect(client.id)}
                        className="w-4 h-4 rounded border-[#D0E3F5] text-[#0077C3] focus:ring-[#0077C3]"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3] shrink-0">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-[#00122E] text-sm">
                            {client.name}
                          </p>
                          <p className="text-xs text-[#335890]">{client.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      {getCompanyTypeLabel(client.companyType)}
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                      {client._count.assignments}
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                      {client._count.normalFiles}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      {new Date(client.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {", "}
                      {new Date(client.createdAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-4">
                      {client.denomination ? (
                        <Badge variant="outline" className="text-xs">
                          {client.denomination}
                        </Badge>
                      ) : (
                        <span className="text-xs text-[#94A3B8]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReportingClient(client)}
                          className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                          title="Reporting"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailsClient(client)}
                          className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                          title="Voir les détails"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ClientDetailsDialog
          client={detailsClient}
          open={!!detailsClient}
          onClose={() => setDetailsClient(null)}
          getCompanyTypeLabel={getCompanyTypeLabel}
        />

        <ReportingParamsDialog
          open={!!reportingClient}
          clientName={reportingClient?.name}
          onClose={() => setReportingClient(null)}
          onValidate={(params) => {
            if (!reportingClient) return;
            const qs = paramsToQuery(params);
            router.push(`/clients/${reportingClient.id}?${qs}`);
          }}
        />

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[#335890]">
              <span>5</span>
              <span>Lignes par page</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-[#335890]">Page</span>
              {getPageNumbers().map((p, i) =>
                typeof p === "string" ? (
                  <span key={i} className="text-sm text-[#94A3B8] px-1">
                    ...
                  </span>
                ) : (
                  <button
                    key={i}
                    onClick={() => handlePageChange(p)}
                    className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                      p === pagination.page
                        ? "bg-[#0077C3] text-white"
                        : "text-[#335890] hover:bg-[#EBF5FF]"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="text-[#335890]"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="text-[#335890]"
              >
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
