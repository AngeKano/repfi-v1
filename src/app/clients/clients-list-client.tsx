"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Users,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";

const COMPANY_TYPES = [
  { value: "", label: "Tous les types" },
  { value: "TECHNOLOGIE", label: "Technologie" },
  { value: "FINANCE", label: "Finance" },
  { value: "SANTE", label: "Sant\u00e9" },
  { value: "EDUCATION", label: "\u00c9ducation" },
  { value: "COMMERCE", label: "Commerce" },
  { value: "INDUSTRIE", label: "Industrie" },
  { value: "AGRICULTURE", label: "Agriculture" },
  { value: "IMMOBILIER", label: "Immobilier" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "ENERGIE", label: "\u00c9nergie" },
  { value: "TELECOMMUNICATION", label: "T\u00e9l\u00e9communication" },
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

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#00122E]">Clients</h1>
            <p className="text-sm text-[#335890] mt-1">
              {pagination.total} client{pagination.total > 1 ? "s" : ""} au
              total
            </p>
          </div>

          {canCreateClient && (
            <Link href="/clients/new">
              <Button className="bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau client
              </Button>
            </Link>
          )}
        </div>

        {/* Search and Filters */}
        <div className="flex gap-3 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3 flex-1">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
              <Input
                placeholder="Rechercher par nom, email ou d\u00e9nomination..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 bg-[#F8FAFC] border-[#E2E8F0]"
              />
            </div>
            <Select value={companyType} onValueChange={setCompanyType}>
              <SelectTrigger className="w-[200px] h-11 bg-[#F8FAFC] border-[#E2E8F0]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value || "all"}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" className="h-11">
              Rechercher
            </Button>
          </form>
        </div>

        {/* Clients Table */}
        {initialClients.length === 0 ? (
          <div className="text-center py-16 border border-[#D0E3F5] rounded-xl bg-white">
            <Users className="w-16 h-16 text-[#D0E3F5] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#00122E] mb-2">
              Aucun client trouv\u00e9
            </h3>
            <p className="text-[#335890] mb-6">
              {search || companyType
                ? "Essayez de modifier vos crit\u00e8res de recherche"
                : "Commencez par cr\u00e9er votre premier client"}
            </p>
            {canCreateClient && (
              <Link href="/clients/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Cr\u00e9er un client
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Nom
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Fichiers
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Membres
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
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
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#00122E] text-sm">
                          {client.name}
                        </p>
                        {client.isSelfEntity && (
                          <Badge variant="secondary" className="text-xs">
                            Entreprise
                          </Badge>
                        )}
                      </div>
                      {client.denomination && (
                        <p className="text-xs text-[#335890] mt-0.5">
                          {client.denomination}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#335890]">
                      {client.email}
                      {client.phone && (
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          {client.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="outline" className="text-xs">
                        {getCompanyTypeLabel(client.companyType)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-[#335890]">
                        <FileText className="w-4 h-4" />
                        {client._count.normalFiles}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-[#335890]">
                        <Users className="w-4 h-4" />
                        {client._count.assignments}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#335890]">
                      {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Link href={`/clients/${client.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF]"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Voir
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-[#335890]">
              Page {pagination.page} sur {pagination.totalPages}
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Pr\u00e9c\u00e9dent
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
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
