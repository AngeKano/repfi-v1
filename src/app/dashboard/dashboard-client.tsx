// app/dashboard/dashboard-client.tsx
"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Building2,
  Users,
  FileText,
  FolderOpen,
  LogOut,
  Plus,
  Settings,
  TrendingUp,
  Download,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface DashboardClientProps {
  session: any;
  stats: {
    clientsCount: number;
    filesCount: number;
    membersCount: number;
  };
  recentClients: any[];
  recentFiles: any[];
}

export default function DashboardClient({
  session,
  stats,
  recentClients,
  recentFiles,
}: DashboardClientProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/auth/signin");
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      ADMIN_ROOT: { variant: "destructive", label: "Admin Root" },
      ADMIN: { variant: "default", label: "Admin" },
      USER: { variant: "secondary", label: "Utilisateur" },
    };
    return variants[role] || variants.USER;
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      // Appeler l'API pour obtenir l'URL signée
      const response = await fetch(`/api/files/download/normal/${fileId}`);

      if (!response.ok) {
        throw new Error("Erreur lors du téléchargement");
      }

      const data = await response.json();

      // Télécharger le fichier avec l'URL signée
      const link = document.createElement("a");
      link.href = data.url;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Téléchargement démarré");
    } catch (error) {
      console.error("Erreur téléchargement:", error);
      toast.error("Erreur lors du téléchargement du fichier");
    }
  };

  const roleInfo = getRoleBadge(session.user.role);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {session.user.companyName}
                </h1>
                <p className="text-xs text-gray-500">
                  {session.user.companyPackType}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {session.user.name || session.user.email}
                </p>
                <Badge variant={roleInfo.variant} className="text-xs">
                  {roleInfo.label}
                </Badge>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/settings")}
              >
                <Settings className="w-5 h-5" />
              </Button>

              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Bienvenue{" "}
            {session.user.firstName
              ? session.user.firstName
              : session.user.name}{" "}
            👋
          </h2>
          <p className="text-gray-600">
            Voici un aperçu de votre activité comptable
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FolderOpen className="w-6 h-6 text-blue-600" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">
              {stats.clientsCount}
            </h3>
            <p className="text-sm text-gray-600">
              {stats.clientsCount > 1 ? "Clients" : "Client"}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">
              {stats.filesCount}
            </h3>
            <p className="text-sm text-gray-600">
              {stats.filesCount > 1 ? "Fichiers" : "Fichier"}
            </p>
          </Card>

          {(session.user.role === "ADMIN_ROOT" ||
            session.user.role === "ADMIN") && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {stats.membersCount}
              </h3>
              <p className="text-sm text-gray-600">
                {stats.membersCount > 1 ? "Membres" : "Membre"}
              </p>
            </Card>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Actions rapides
            </h3>
            <div className="space-y-3">
              {(session.user.role === "ADMIN_ROOT" ||
                session.user.role === "ADMIN") &&
                session.user.companyPackType === "ENTREPRISE" && (
                  <Link href="/clients/new">
                    <Button className="w-full justify-start" variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Créer un nouveau client
                    </Button>
                  </Link>
                )}

              <Link href="/clients">
                <Button className="w-full justify-start" variant="outline">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Voir tous les clients
                </Button>
              </Link>

              {(session.user.role === "ADMIN_ROOT" ||
                session.user.role === "ADMIN") && (
                <Link href="/users">
                  <Button className="w-full justify-start" variant="outline">
                    <Users className="w-4 h-4 mr-2" />
                    Gérer les membres
                  </Button>
                </Link>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Informations entreprise
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Nom</p>
                <p className="font-medium">{session.user.companyName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Type de pack</p>
                <Badge variant="outline">{session.user.companyPackType}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">Votre rôle</p>
                <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Clients */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Clients récents
            </h3>
            <Link href="/clients">
              <Button variant="ghost" size="sm">
                Voir tout
              </Button>
            </Link>
          </div>

          {recentClients.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Aucun client pour le moment
            </p>
          ) : (
            <div className="space-y-3">
              {recentClients.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {client.name}
                          {client.isSelfEntity && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Entreprise
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">{client.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {client.companyType}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Files */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Fichiers récents
            </h3>
            {/* <Link href="/files">
              <Button variant="ghost" size="sm">
                Voir tout
              </Button>
            </Link> */}
          </div>

          {recentFiles.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Aucun fichier pour le moment
            </p>
          ) : (
            <div className="space-y-3">
              {recentFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded">
                      <FileText className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {file.fileName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {file.client.name} •{" "}
                        {file.uploadedBy.firstName || file.uploadedBy.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Badge
                        variant={
                          file.status === "SUCCES"
                            ? "default"
                            : file.status === "ERROR"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {file.status}
                      </Badge>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(file.uploadedAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    {file.status === "SUCCES" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(file.id, file.fileName)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
