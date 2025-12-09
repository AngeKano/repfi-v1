// app/clients/[id]/assign/client-assignment-client.tsx - ADAPTED
// Version SANS assignedBy dans les données

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  UserPlus,
  UserMinus,
  Users,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

interface ClientAssignmentClientProps {
  session: any;
  client: {
    id: string;
    name: string;
    email: string;
  };
  initialAssignments: any[];
  availableMembers: any[];
}

export default function ClientAssignmentClient({
  session,
  client,
  initialAssignments,
  availableMembers,
}: ClientAssignmentClientProps) {
  const router = useRouter();

  const [assignments, setAssignments] = useState(initialAssignments);
  const [available, setAvailable] = useState(availableMembers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);

  const [selectedToAssign, setSelectedToAssign] = useState<string[]>([]);
  const [selectedToUnassign, setSelectedToUnassign] = useState<string[]>([]);

  const handleAssign = async () => {
    if (selectedToAssign.length === 0) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/clients/${client.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedToAssign }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erreur lors de l'assignation");
      }

      setSuccess(`${result.stats.newAssignments} membre(s) assigné(s)`);
      setSelectedToAssign([]);
      setAssignDialogOpen(false);

      setTimeout(() => {
        router.refresh();
      }, 500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (selectedToUnassign.length === 0) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/clients/${client.id}/assign`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedToUnassign }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erreur lors du retrait");
      }

      setSuccess(`${result.stats.removed} membre(s) retiré(s)`);
      setSelectedToUnassign([]);
      setUnassignDialogOpen(false);

      setTimeout(() => {
        router.refresh();
      }, 500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssignSelection = (userId: string) => {
    setSelectedToAssign((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleUnassignSelection = (userId: string) => {
    setSelectedToUnassign((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href={`/clients/${client.id}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Gérer les membres
                </h1>
                <p className="text-sm text-gray-500">{client.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3 mb-6">
          <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={available.length === 0}>
                <UserPlus className="w-4 h-4 mr-2" />
                Assigner des membres ({available.length} disponibles)
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assigner des membres</DialogTitle>
                <DialogDescription>
                  Sélectionnez les membres à assigner à {client.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {available.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleAssignSelection(member.id)}
                  >
                    <Checkbox
                      checked={selectedToAssign.includes(member.id)}
                      onCheckedChange={() => toggleAssignSelection(member.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.firstName && member.lastName
                          ? `${member.firstName} ${member.lastName}`
                          : member.email}
                      </p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                    <Badge variant="outline">{member.role}</Badge>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleAssign}
                  disabled={selectedToAssign.length === 0 || loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Assignation...
                    </>
                  ) : (
                    <>Assigner ({selectedToAssign.length})</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignDialogOpen(false);
                    setSelectedToAssign([]);
                  }}
                  disabled={loading}
                >
                  Annuler
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={unassignDialogOpen}
            onOpenChange={setUnassignDialogOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" disabled={assignments.length === 0}>
                <UserMinus className="w-4 h-4 mr-2" />
                Retirer des membres
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Retirer des membres</DialogTitle>
                <DialogDescription>
                  Sélectionnez les membres à retirer de {client.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.user.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleUnassignSelection(assignment.user.id)}
                  >
                    <Checkbox
                      checked={selectedToUnassign.includes(assignment.user.id)}
                      onCheckedChange={() =>
                        toggleUnassignSelection(assignment.user.id)
                      }
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {assignment.user.firstName && assignment.user.lastName
                          ? `${assignment.user.firstName} ${assignment.user.lastName}`
                          : assignment.user.email}
                      </p>
                      <p className="text-sm text-gray-500">
                        {assignment.user.email}
                      </p>
                    </div>
                    <Badge variant="outline">{assignment.user.role}</Badge>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="destructive"
                  onClick={handleUnassign}
                  disabled={selectedToUnassign.length === 0 || loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Retrait...
                    </>
                  ) : (
                    <>Retirer ({selectedToUnassign.length})</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUnassignDialogOpen(false);
                    setSelectedToUnassign([]);
                  }}
                  disabled={loading}
                >
                  Annuler
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              Membres assignés ({assignments.length})
            </h2>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">Aucun membre assigné</p>
              <Button
                onClick={() => setAssignDialogOpen(true)}
                disabled={available.length === 0}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Assigner des membres
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="font-medium text-blue-600">
                        {assignment.user.firstName?.[0] ||
                          assignment.user.email[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {assignment.user.firstName && assignment.user.lastName
                          ? `${assignment.user.firstName} ${assignment.user.lastName}`
                          : assignment.user.email}
                      </p>
                      <p className="text-sm text-gray-500">
                        {assignment.user.email}
                      </p>
                      {/* ✅ Supprimé info "Assigné par" */}
                      <p className="text-xs text-gray-400 mt-1">
                        Assigné le{" "}
                        {new Date(assignment.assignedAt).toLocaleDateString(
                          "fr-FR"
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{assignment.user.role}</Badge>
                    {!assignment.user.isActive && (
                      <Badge variant="destructive">Désactivé</Badge>
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
