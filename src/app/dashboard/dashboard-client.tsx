// app/dashboard/dashboard-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Building2, Users, FileText, RefreshCw, Eye } from "lucide-react";
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
  recentReportings: any[];
  canViewMembers: boolean;
  canCreateClient: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-[#FEF3C7] text-[#B45309]" },
  VALIDATING: { label: "Validation", className: "bg-[#DBEAFE] text-[#1D4ED8]" },
  PROCESSING: { label: "En cours", className: "bg-[#E0E7FF] text-[#4338CA]" },
  COMPLETED: { label: "Complété", className: "bg-[#DCFCE7] text-[#16A34A]" },
  FAILED: { label: "Échec", className: "bg-[#FEE2E2] text-[#DC2626]" },
};

export default function DashboardClient({
  session,
  stats,
  recentReportings,
  canViewMembers,
}: DashboardClientProps) {
  const router = useRouter();

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  const formatNumber = (n: number) => String(n).padStart(2, "0");

  const formatPeriod = (start: string | Date, end: string | Date) => {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    };
    return `${s.toLocaleDateString("fr-FR", opts)} - ${e.toLocaleDateString("fr-FR", opts)}`;
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

        {/* Overview Title */}
        <h1 className="text-3xl font-bold text-[#00122E] mb-6">Overview</h1>

        {/* Company Card */}
        <div className="flex items-center gap-4 mb-6">
          <Card className="flex items-center gap-4 px-5 py-4 w-fit">
            <div className="w-12 h-12 rounded-xl bg-[#EBF5FF] flex items-center justify-center">
              <Image
                src="/logo-click-insight-unit.png"
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

        {/* Recent Reporting Financier */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#00122E]">
              Reportings financiers récents
            </h3>
            <Link href="/clients">
              <Button variant="ghost" size="sm" className="text-[#0077C3]">
                Voir tout
              </Button>
            </Link>
          </div>

          {recentReportings.length === 0 ? (
            <p className="text-[#335890] text-center py-8">
              Aucun reporting financier pour le moment
            </p>
          ) : (
            <div className="border border-[#D0E3F5] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Client
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Période
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Année
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Fichiers
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Créé le
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentReportings.map((r, idx) => {
                    const statusMeta = STATUS_LABELS[r.status] || {
                      label: r.status,
                      className: "bg-[#F1F5F9] text-[#335890]",
                    };
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-[#D0E3F5] last:border-b-0 hover:bg-[#F5F9FF] transition-colors ${
                          idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                        }`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3] shrink-0">
                              {r.client.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-[#00122E] text-sm">
                                {r.client.name}
                              </p>
                              <p className="text-xs text-[#335890]">
                                {r.client.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-[#335890]">
                          {formatPeriod(r.periodStart, r.periodEnd)}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                          {r.year}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                          {r._count?.files ?? 0}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-[#335890]">
                          {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center">
                            <Link href={`/clients/${r.client.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                                title="Voir"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
