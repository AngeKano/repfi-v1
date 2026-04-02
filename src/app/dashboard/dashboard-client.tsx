// app/dashboard/dashboard-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Building2,
  Users,
  FileText,
  RefreshCw,
  Download,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { DashboardLayout } from "@/components/dashboard-layout";
import Image from "next/image";

interface DashboardClientProps {
  session: any;
  stats: {
    clientsCount: number;
    filesCount: number;
    membersCount: number;
  };
  recentClients: any[];
  recentFiles: any[];
  canViewMembers: boolean;
  canCreateClient: boolean;
}

export default function DashboardClient({
  session,
  stats,
  recentClients,
  recentFiles,
  canViewMembers,
  canCreateClient,
}: DashboardClientProps) {
  const router = useRouter();

  const handleDownload = (fileId: string, _fileName: string) => {
    window.location.href = `/api/files/download/normal/${fileId}`;
  };

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  const formatNumber = (n: number) => String(n).padStart(2, "0");

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
            Rafra\u00eechir
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

        {/* Dashboard Title */}
        <h1 className="text-3xl font-bold text-[#00122E] mb-6">Dashboard</h1>

        {/* Company Card */}
        <div className="flex items-center gap-4 mb-6">
          <Card className="flex items-center gap-4 px-5 py-4 w-fit">
            <div className="w-12 h-12 rounded-xl bg-[#EBF5FF] flex items-center justify-center">
              <Image
                src="/logo-click-insight-fill.png"
                alt=""
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div>
              <p className="text-xs text-[#0077C3] font-medium">Entreprise</p>
              <p className="text-base font-bold text-[#00122E]">
                {session.user.companyName}
              </p>
              <Badge variant="outline" className="text-xs mt-1">
                {session.user.companyPackType === "ENTREPRISE"
                  ? "Informatique"
                  : session.user.companyPackType}
              </Badge>
            </div>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mb-8">
          {/* Clients */}
          <div className="flex items-center gap-4 px-6 py-5 border border-[#D0E3F5] rounded-l-xl bg-white">
            <div className="w-12 h-12 rounded-xl bg-[#EBF5FF] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#0077C3]" />
            </div>
            <div>
              <p className="text-sm text-[#335890] font-medium">Clients</p>
              <p className="text-3xl font-bold text-[#00122E]">
                {formatNumber(stats.clientsCount)}
              </p>
            </div>
            <div className="ml-auto w-1 h-12 bg-[#0077C3] rounded-full" />
          </div>

          {/* Fichiers */}
          <div className="flex items-center gap-4 px-6 py-5 border-y border-[#D0E3F5] bg-white">
            <div className="w-12 h-12 rounded-xl bg-[#F3E8FF] flex items-center justify-center">
              <FileText className="w-6 h-6 text-[#9333EA]" />
            </div>
            <div>
              <p className="text-sm text-[#335890] font-medium">Fichiers</p>
              <p className="text-3xl font-bold text-[#00122E]">
                {formatNumber(stats.filesCount)}
              </p>
            </div>
            <div className="ml-auto w-1 h-12 bg-[#9333EA] rounded-full" />
          </div>

          {/* Membres */}
          {canViewMembers && (
            <div className="flex items-center gap-4 px-6 py-5 border border-[#D0E3F5] rounded-r-xl bg-white">
              <div className="w-12 h-12 rounded-xl bg-[#DCFCE7] flex items-center justify-center">
                <Users className="w-6 h-6 text-[#16A34A]" />
              </div>
              <div>
                <p className="text-sm text-[#335890] font-medium">Membres</p>
                <p className="text-3xl font-bold text-[#00122E]">
                  {formatNumber(stats.membersCount)}
                </p>
              </div>
              <div className="ml-auto w-1 h-12 bg-[#16A34A] rounded-full" />
            </div>
          )}
        </div>

        {/* Recent Clients */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#00122E]">
              Clients r\u00e9cents
            </h3>
            <Link href="/clients">
              <Button variant="ghost" size="sm" className="text-[#0077C3]">
                Voir tout
              </Button>
            </Link>
          </div>

          {recentClients.length === 0 ? (
            <p className="text-[#335890] text-center py-8">
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
                  <div className="flex items-center justify-between p-4 border border-[#D0E3F5] rounded-lg hover:bg-[#F5F9FF] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#EBF5FF] rounded-lg">
                        <Building2 className="w-5 h-5 text-[#0077C3]" />
                      </div>
                      <div>
                        <p className="font-medium text-[#00122E]">
                          {client.name}
                          {client.isSelfEntity && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Entreprise
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-[#335890]">{client.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#335890]">
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
            <h3 className="text-lg font-semibold text-[#00122E]">
              Fichiers r\u00e9cents
            </h3>
          </div>

          {recentFiles.length === 0 ? (
            <p className="text-[#335890] text-center py-8">
              Aucun fichier pour le moment
            </p>
          ) : (
            <div className="space-y-3">
              {recentFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 border border-[#D0E3F5] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#F3E8FF] rounded-lg">
                      <FileText className="w-5 h-5 text-[#9333EA]" />
                    </div>
                    <div>
                      <p className="font-medium text-[#00122E]">
                        {file.fileName}
                      </p>
                      <p className="text-sm text-[#335890]">
                        {file.client.name} \u2022{" "}
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
                      <p className="text-xs text-[#335890] mt-1">
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
      </div>
    </DashboardLayout>
  );
}
