// app/clients/clients-list-client.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Search,
  Plus,
  Users,
  FileText,
  Filter,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

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
}

export default function ClientsListClient({
  session,
  initialClients,
  pagination,
  initialSearch,
  initialType,
}: ClientsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [companyType, setCompanyType] = useState(initialType);
  const [showFilters, setShowFilters] = useState(false);

  const canCreateClient =
    (session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN") &&
    session.user.companyPackType === "ENTREPRISE";

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                <p className="text-sm text-gray-500">
                  {pagination.total} client{pagination.total > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {canCreateClient && (
              <Link href="/clients/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau client
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <Card className="p-4 mb-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Rechercher par nom, email ou dénomination..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* <Button
                type="button"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filtres
              </Button> */}

              <Button type="submit">Rechercher</Button>
            </div>

            {showFilters && (
              <div className="pt-3 border-t">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Type d'entreprise
                    </label>
                    <Select value={companyType} onValueChange={setCompanyType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Card>

        {/* Clients List */}
        {initialClients.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucun client trouvé
            </h3>
            <p className="text-gray-600 mb-6">
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
          </Card>
        ) : (
          <div className="space-y-4">
            {initialClients.map((client) => (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <Building2 className="w-6 h-6 text-blue-600" />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {client.name}
                          </h3>
                          {client.isSelfEntity && (
                            <Badge variant="secondary">Entreprise</Badge>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-3">
                          {client.email}
                          {client.phone && ` • ${client.phone}`}
                        </p>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            <span>
                              {client._count.normalFiles} fichier
                              {client._count.normalFiles > 1 ? "s" : ""}
                            </span>
                          </div>

                          {client.assignedMembers && (
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>
                                {client._count.assignments} membre
                                {client._count.assignments > 1 ? "s" : ""}
                              </span>
                            </div>
                          )}

                          <Badge variant="outline">
                            {getCompanyTypeLabel(client.companyType)}
                          </Badge>
                        </div>

                        {client.description && (
                          <p className="text-sm text-gray-500 mt-3 line-clamp-2">
                            {client.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      <p>
                        {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                      {client.denomination && (
                        <Badge variant="outline" className="mt-2">
                          {client.denomination}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Assigned Members Preview */}
                  {client.assignedMembers &&
                    client.assignedMembers.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-xs text-gray-500 mb-2">
                          Membres assignés :
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {client.assignedMembers
                            .slice(0, 3)
                            .map((member: any) => (
                              <Badge key={member.id} variant="secondary">
                                {member.firstName && member.lastName
                                  ? `${member.firstName} ${member.lastName}`
                                  : member.email}
                              </Badge>
                            ))}
                          {client.assignedMembers.length > 3 && (
                            <Badge variant="secondary">
                              +{client.assignedMembers.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Page {pagination.page} sur {pagination.totalPages}
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Précédent
              </Button>

              <Button
                variant="outline"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
