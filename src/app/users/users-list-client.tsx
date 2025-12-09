// app/users/users-list-client.tsx
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
  Users,
  Search,
  Plus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Building2,
  Shield,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";

interface UsersListClientProps {
  session: any;
  initialUsers: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  initialSearch: string;
  initialRole: string;
}

export default function UsersListClient({
  session,
  initialUsers,
  pagination,
  initialSearch,
  initialRole,
}: UsersListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [role, setRole] = useState(initialRole);

  const canAddMember =
    session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN";
  // NEW
  // &&
  // session.user.companyPackType === "ENTREPRISE";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    if (role) {
      params.set("role", role);
    } else {
      params.delete("role");
    }
    router.push(`/users?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/users?${params.toString()}`);
  };

  const getRoleIcon = (userRole: string) => {
    if (userRole === "ADMIN_ROOT") return <ShieldAlert className="w-4 h-4" />;
    if (userRole === "ADMIN") return <Shield className="w-4 h-4" />;
    return <UserIcon className="w-4 h-4" />;
  };

  const getRoleLabel = (userRole: string) => {
    if (userRole === "ADMIN_ROOT") return "Admin Root";
    if (userRole === "ADMIN") return "Admin";
    return "Utilisateur";
  };

  const getRoleBadgeVariant = (userRole: string) => {
    if (userRole === "ADMIN_ROOT") return "destructive";
    if (userRole === "ADMIN") return "default";
    return "secondary";
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
                <h1 className="text-2xl font-bold text-gray-900">Membres</h1>
                <p className="text-sm text-gray-500">
                  {pagination.total} membre{pagination.total > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {canAddMember && (
              <Link href="/users/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un membre
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
                  placeholder="Rechercher par nom ou email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  <SelectItem value="ADMIN_ROOT">Admin Root</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="USER">Utilisateur</SelectItem>
                </SelectContent>
              </Select> */}

              <Button type="submit">Rechercher</Button>
            </div>
          </form>
        </Card>

        {/* Users List */}
        {initialUsers.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucun membre trouvé
            </h3>
            <p className="text-gray-600 mb-6">
              {search || role
                ? "Essayez de modifier vos critères de recherche"
                : "Commencez par ajouter votre premier membre"}
            </p>
            {canAddMember && (
              <Link href="/users/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un membre
                </Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {initialUsers.map((user) => (
              <Link key={user.id} href={`/users/${user.id}`}>
                <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-lg font-semibold text-blue-600">
                          {user.firstName?.[0] || user.email[0].toUpperCase()}
                        </span>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {user.firstName && user.lastName
                              ? `${user.firstName} ${user.lastName}`
                              : user.email}
                          </h3>
                          {!user.isActive && (
                            <Badge variant="destructive">Désactivé</Badge>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-3">
                          {user.email}
                        </p>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            {getRoleIcon(user.role)}
                            <Badge
                              variant={getRoleBadgeVariant(user.role) as any}
                            >
                              {getRoleLabel(user.role)}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            <span>
                              {user._count.clientAssignments} client
                              {user._count.clientAssignments > 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            <span>
                              {user._count.uploadedFiles} fichier
                              {user._count.uploadedFiles > 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      <p>
                        Créé le{" "}
                        {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                      {user.lastLoginAt && (
                        <p className="mt-1">
                          Dernière connexion :{" "}
                          {new Date(user.lastLoginAt).toLocaleDateString(
                            "fr-FR"
                          )}
                        </p>
                      )}
                    </div>
                  </div>
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
