"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, Wallet, UserCircle } from "lucide-react";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { DashboardLayout } from "@/components/dashboard-layout";

interface SettingsClientProps {
  session: any;
}

type SettingsTab = "comptes" | "profil";

const TABS: { id: SettingsTab; label: string; icon: any }[] = [
  { id: "comptes", label: "Comptes", icon: Wallet },
  { id: "profil", label: "Profil", icon: UserCircle },
];

export default function SettingsClient({ session }: SettingsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("comptes");

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  const firstName = session.user.firstName || "";
  const lastName = session.user.lastName || "";
  const fullName =
    firstName && lastName ? `${firstName} ${lastName}` : session.user.email;

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
              <p className="text-sm font-semibold text-[#00122E]">{fullName}</p>
              <Badge
                variant={roleBadgeVariant as any}
                className="text-xs mt-0.5"
              >
                {roleLabel}
              </Badge>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center overflow-hidden">
              <Users className="w-5 h-5 text-[#0077C3]" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-[#00122E] mb-6">Paramètres</h1>

        {/* Sub Tabs */}
        <div className="flex items-center gap-6 mb-6 border-b border-[#D0E3F5]">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-3 text-sm font-medium transition-colors relative ${
                  active
                    ? "text-[#0077C3]"
                    : "text-[#335890] hover:text-[#0077C3]"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "comptes" && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[#00122E] mb-4">
              Comptes
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Entreprise</p>
                <p className="text-sm font-semibold text-[#00122E]">
                  {session.user.companyName || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Type de pack</p>
                <Badge variant="outline" className="text-xs">
                  {session.user.companyPackType || "-"}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">
                  Email du compte
                </p>
                <p className="text-sm font-semibold text-[#00122E]">
                  {session.user.email}
                </p>
              </div>
            </div>
          </Card>
        )}

        {activeTab === "profil" && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[#00122E] mb-4">
              Profil
            </h2>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-[#EBF5FF] flex items-center justify-center text-2xl font-bold text-[#0077C3]">
                {(firstName || session.user.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-[#00122E]">{fullName}</p>
                <p className="text-sm text-[#335890]">{session.user.email}</p>
                <Badge
                  variant={roleBadgeVariant as any}
                  className="text-xs mt-1"
                >
                  {roleLabel}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Prénom</p>
                <p className="text-sm font-semibold text-[#00122E]">
                  {firstName || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Nom</p>
                <p className="text-sm font-semibold text-[#00122E]">
                  {lastName || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Email</p>
                <p className="text-sm font-semibold text-[#00122E]">
                  {session.user.email}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Rôle</p>
                <p className="text-sm font-semibold text-[#00122E]">
                  {roleLabel}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
