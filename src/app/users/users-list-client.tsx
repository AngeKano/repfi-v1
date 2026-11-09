// app/users/users-list-client.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Edit,
  RefreshCw,
} from "lucide-react";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { formatNombre } from "@/lib/nombres";
import { DashboardLayout } from "@/components/dashboard-layout";
import { MembreDetailsDialog } from "./membre-details-dialog";
import { MembreFormDialog } from "./membre-form-dialog";
import {
  nomMembre,
  type DossierOption,
  type DroitsMembres,
  type InfoRole,
  type MembreLigne,
} from "./types";

interface UsersListClientProps {
  session: any;
  initialUsers: MembreLigne[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  initialSearch: string;
  initialRole: string;
  droits: DroitsMembres;
  infosRoles: Record<string, InfoRole>;
  rolesAttribuables: string[];
  dossiers: DossierOption[];
}

export default function UsersListClient({
  session,
  initialUsers,
  pagination,
  initialSearch,
  initialRole,
  droits,
  infosRoles,
  rolesAttribuables,
  dossiers,
}: UsersListClientProps) {
  const canAddMember = droits.peutCreer;
  // Fenêtres : création, consultation, modification, désactivation.
  const [creation, setCreation] = useState(false);
  const [consulte, setConsulte] = useState<MembreLigne | null>(null);
  const [modifie, setModifie] = useState<MembreLigne | null>(null);
  const [aDesactiver, setADesactiver] = useState<MembreLigne | null>(null);
  const [desactivation, setDesactivation] = useState(false);

  const desactiver = async () => {
    if (!aDesactiver) return;
    setDesactivation(true);
    try {
      const res = await fetch(`/api/users/${aDesactiver.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Désactivation impossible");
      toast.success(`${nomMembre(aDesactiver)} désactivé`);
      setADesactiver(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Désactivation impossible");
    } finally {
      setDesactivation(false);
    }
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [role, setRole] = useState(initialRole);
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");

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

  const activeUsers = initialUsers.filter((u) => u.isActive);
  const inactiveCount = initialUsers.filter((u) => !u.isActive).length;

  // Generate page numbers
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
            className="rounded-full bg-[#EBF5FF] text-[#335890] border-[#D0E3F5] hover:bg-[#D0E3F5]"
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
          <h1 className="text-3xl font-bold text-[#00122E]">Membres</h1>

          <div className="flex items-center gap-3">
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

            {canAddMember && (
              <Button
                onClick={() => setCreation(true)}
                className="h-10 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouveau membre
              </Button>
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
            Membres actifs / inactifs ({formatNombre(pagination.total)})
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
            Membres Supprimés (0)
            {activeTab === "deleted" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
        </div>

        {/* Users Table */}
        {initialUsers.length === 0 ? (
          <div className="text-center py-16 border border-[#D0E3F5] rounded-xl bg-white">
            <Users className="w-16 h-16 text-[#D0E3F5] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#00122E] mb-2">
              Aucun membre trouvé
            </h3>
            <p className="text-[#335890] mb-6">
              {search || role
                ? "Essayez de modifier vos critères de recherche"
                : "Commencez par ajouter votre premier membre"}
            </p>
            {canAddMember && (
              <Button onClick={() => setCreation(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un membre
              </Button>
            )}
          </div>
        ) : (
          <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Membre
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Téléphone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Rôle
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Clients assignés
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Fichiers chargés
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Date de création
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Dernière connexion
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialUsers.map((user, idx) => (
                  <tr
                    key={user.id}
                    className={`border-b border-[#D0E3F5] last:border-b-0 hover:bg-[#F5F9FF] transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3] shrink-0">
                          {user.firstName
                            ? user.firstName.charAt(0).toUpperCase()
                            : user.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-[#00122E] text-sm">
                            {user.firstName && user.lastName
                              ? `${user.firstName} ${user.lastName}`
                              : user.email}
                          </p>
                          <p className="text-xs text-[#335890]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      -
                    </td>
                    <td className="px-4 py-4">
                      <Badge
                        variant={getRoleBadgeVariant(user.role) as any}
                        className="text-xs"
                      >
                        {getRoleLabel(user.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                      {user.voitTousLesDossiers ? (
                        <span
                          className="text-xs font-semibold text-emerald-700"
                          title="Administrateur : attribué d'office à tous les dossiers"
                        >
                          Tous
                        </span>
                      ) : user._count.clientAssignments === 0 ? (
                        <span className="text-amber-600" title="Aucun dossier attribué : ce membre ne voit aucun dossier">
                          0
                        </span>
                      ) : (
                        user._count.clientAssignments
                      )}
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                      {user._count.normalFiles}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {", "}
                      {new Date(user.createdAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      {user.lastLoginAt
                        ? `${new Date(user.lastLoginAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}, ${new Date(user.lastLoginAt).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : "-"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant={user.isActive ? "default" : "secondary"}
                        className={`text-xs ${
                          user.isActive
                            ? "bg-[#DCFCE7] text-[#16A34A] hover:bg-[#DCFCE7]"
                            : "bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FEE2E2]"
                        }`}
                      >
                        {user.isActive ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                          title="Modifier"
                          aria-label={`Modifier ${nomMembre(user)}`}
                          disabled={!user.peutModifier}
                          onClick={() => setModifie(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                          title="Désactiver"
                          aria-label={`Désactiver ${nomMembre(user)}`}
                          disabled={!user.peutDesactiver || !user.isActive}
                          onClick={() => setADesactiver(user)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                          title="Voir"
                          aria-label={`Voir ${nomMembre(user)}`}
                          onClick={() => setConsulte(user)}
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

      {creation && (
        <MembreFormDialog
          rolesAttribuables={rolesAttribuables}
          infosRoles={infosRoles}
          dossiers={dossiers}
          droits={droits}
          onClose={() => setCreation(false)}
          onEnregistre={() => {
            setCreation(false);
            router.refresh();
          }}
        />
      )}

      {modifie && (
        <MembreFormDialog
          membre={modifie}
          rolesAttribuables={rolesAttribuables}
          infosRoles={infosRoles}
          dossiers={dossiers}
          droits={droits}
          onClose={() => setModifie(null)}
          onEnregistre={() => {
            setModifie(null);
            router.refresh();
          }}
        />
      )}

      {consulte && (
        <MembreDetailsDialog
          membre={consulte}
          nbDossiersEntreprise={dossiers.length}
          onClose={() => setConsulte(null)}
          onModifier={() => {
            setModifie(consulte);
            setConsulte(null);
          }}
          onDesactiver={() => {
            setADesactiver(consulte);
            setConsulte(null);
          }}
        />
      )}

      <AlertDialog open={!!aDesactiver} onOpenChange={(o) => !o && !desactivation && setADesactiver(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver {aDesactiver ? nomMembre(aDesactiver) : ""} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce membre ne pourra plus se connecter. Ses dossiers attribués et ses accès sont
              conservés : il les retrouvera s&apos;il est réactivé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desactivation}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={desactivation}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                desactiver();
              }}
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
