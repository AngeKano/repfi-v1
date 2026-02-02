// app/users/[id]/user-details-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  FileText,
  Shield,
  ShieldAlert,
  User as UserIcon,
  Mail,
  Calendar,
  Clock,
  Briefcase,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { getRoleLabel, getRoleBadgeVariant } from "@/lib/permissions/role-utils";

interface RoleOption {
  value: string;
  label: string;
}

interface UserDetailsClientProps {
  session: any;
  user: any;
  canEdit: boolean;
  canDeactivate: boolean;
  canChangeRole: boolean;
  availableRoles: RoleOption[];
  isSelf: boolean;
}

export default function UserDetailsClient({
  session,
  user,
  canEdit,
  canDeactivate,
  canChangeRole,
  availableRoles,
  isSelf,
}: UserDetailsClientProps) {
  const router = useRouter();

  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Deactivate dialog
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Form fields
  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.firstName || "");
  const [lastName, setLastName] = useState(user.lastName || "");
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Icone dynamique selon le role
  const getRoleIcon = (userRole: string) => {
    switch (userRole) {
      case "ADMIN_ROOT":
        return <ShieldAlert className="w-5 h-5" />;
      case "ADMIN_CF":
      case "ADMIN":
        return <Shield className="w-5 h-5" />;
      case "ADMIN_PARTENAIRE":
        return <Briefcase className="w-5 h-5" />;
      case "VIEWER":
        return <Eye className="w-5 h-5" />;
      default:
        return <UserIcon className="w-5 h-5" />;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    // Validation mot de passe
    if (password && password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      setLoading(false);
      return;
    }

    if (password && password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caracteres");
      setLoading(false);
      return;
    }

    const data: any = {
      email: email.toLowerCase().trim(),
      firstName: firstName || null,
      lastName: lastName || null,
    };

    // Peut changer le role si autorise
    if (canChangeRole) {
      data.role = role;
    }

    // Peut changer le statut si peut editer et n'est pas soi-meme
    if (canEdit && !isSelf) {
      data.isActive = isActive;
    }

    // Mot de passe optionnel
    if (password) {
      data.password = password;
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erreur lors de la modification");
      }

      setSuccess("Modifications enregistrees avec succes");
      setEditMode(false);
      setPassword("");
      setConfirmPassword("");

      // Rafraichir apres 1s
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    setError("");

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erreur lors de la desactivation");
      }

      setSuccess("Membre desactive avec succes");
      setDeactivateDialogOpen(false);

      // Rediriger apres 1s
      setTimeout(() => {
        router.push("/users");
      }, 1000);
    } catch (err: any) {
      setError(err.message);
      setDeactivating(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setEmail(user.email);
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setRole(user.role);
    setIsActive(user.isActive);
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/users">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
                </h1>
                <p className="text-sm text-gray-500">{user.company.name}</p>
              </div>
            </div>

            <div className="flex gap-2">
              {!editMode && canEdit && (
                <Button onClick={() => setEditMode(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
              )}

              {!editMode && canDeactivate && user.isActive && (
                <Button
                  variant="destructive"
                  onClick={() => setDeactivateDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Desactiver
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alerts */}
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

        {!user.isActive && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              Ce membre est desactive et ne peut plus se connecter.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Profile */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Card */}
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-blue-600">
                    {user.firstName?.[0] || user.email[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getRoleIcon(user.role)}
                    <Badge variant={getRoleBadgeVariant(user.role) as any}>
                      {getRoleLabel(user.role)}
                    </Badge>
                    {!user.isActive && (
                      <Badge variant="destructive">Desactive</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Membre depuis le{" "}
                    {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>

              {!editMode ? (
                // View Mode
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-gray-700">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{user.email}</p>
                    </div>
                  </div>

                  {(user.firstName || user.lastName) && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <UserIcon className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Nom complet</p>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-gray-700">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Cree le</p>
                      <p className="font-medium">
                        {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>

                  {user.lastLoginAt && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <Clock className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">
                          Derniere connexion
                        </p>
                        <p className="font-medium">
                          {new Date(user.lastLoginAt).toLocaleDateString(
                            "fr-FR"
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Edit Mode
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Prenom</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nom</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {canChangeRole && availableRoles.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={role}
                        onValueChange={setRole}
                        disabled={loading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((roleOption) => (
                            <SelectItem
                              key={roleOption.value}
                              value={roleOption.value}
                            >
                              {roleOption.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {canEdit && !isSelf && (
                    <div className="flex items-center gap-2">
                      <input
                        title="Checkbox"
                        type="checkbox"
                        id="isActive"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        disabled={loading}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="isActive" className="cursor-pointer">
                        Compte actif
                      </Label>
                    </div>
                  )}

                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      Changer le mot de passe (optionnel)
                    </p>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="password">Nouveau mot de passe</Label>
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={loading}
                          placeholder="Laisser vide pour ne pas changer"
                        />
                      </div>

                      {password && (
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">
                            Confirmer le mot de passe
                          </Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={loading}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Enregistrer
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancel}
                      disabled={loading}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Annuler
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>

          {/* Right Column - Stats & Clients */}
          <div className="space-y-6">
            {/* Stats Card */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Statistiques</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">Clients assignes</span>
                  </div>
                  <span className="font-semibold">
                    {user._count.clientAssignments}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">Fichiers uploades</span>
                  </div>
                  <span className="font-semibold">
                    {user._count.uploadedFiles}
                  </span>
                </div>
              </div>
            </Card>

            {/* Clients Card */}
            {user.clientAssignments && user.clientAssignments.length > 0 && (
              <Card className="p-6">
                <h3 className="font-semibold mb-4">
                  Clients assignes ({user.clientAssignments.length})
                </h3>
                <div className="space-y-2">
                  {user.clientAssignments.slice(0, 5).map((client: any) => (
                    <Link
                      key={client.id}
                      href={`/clients/${client.id}`}
                      className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <p className="font-medium text-sm">{client.name}</p>
                      <p className="text-xs text-gray-500">{client.email}</p>
                    </Link>
                  ))}
                  {user.clientAssignments.length > 5 && (
                    <p className="text-sm text-gray-500 text-center pt-2">
                      +{user.clientAssignments.length - 5} autres clients
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Deactivate Dialog */}
        <Dialog
          open={deactivateDialogOpen}
          onOpenChange={setDeactivateDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Desactiver ce membre ?
              </DialogTitle>
              <DialogDescription>
                Voulez-vous vraiment desactiver{" "}
                <strong>
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
                </strong>
                ? Cette personne ne pourra plus se connecter.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
              <p className="text-sm text-red-800">
                <strong>Attention :</strong> Ce membre perdra l'acces a tous ses
                clients assignes.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeactivateDialogOpen(false)}
                disabled={deactivating}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeactivate}
                disabled={deactivating}
              >
                {deactivating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Desactivation...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Oui, desactiver
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
