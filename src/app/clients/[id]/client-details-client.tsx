"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  Edit,
  Trash2,
  FileText,
  Users,
  Facebook,
  Linkedin,
  Twitter,
  Calendar,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import FilesTabs from "./files-tabs";
import DeclarationTabs from "./declaration/declaration-tabs";

interface ClientDetailsClientProps {
  session: any;
  initialClient: any;
}

export default function ClientDetailsClient({
  session,
  initialClient,
}: ClientDetailsClientProps) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const canEdit =
    session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN";
  const canDelete = session.user.role === "ADMIN_ROOT";

  const handleDelete = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      router.push("/clients");
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression");
      setLoading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      // Appeler l'API pour obtenir l'URL signée
      const response = await fetch(`/api/files/download/${fileId}`);

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

  const getSocialIcon = (type: string) => {
    const icons: Record<string, any> = {
      FACEBOOK: Facebook,
      LINKEDIN: Linkedin,
      TWITTER: Twitter,
    };
    return icons[type] || Globe;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/clients">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {client.name}
                </h1>
                {client.isSelfEntity && (
                  <Badge variant="secondary" className="mt-1">
                    Entreprise
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {canEdit && !client.isSelfEntity && (
                <>
                  <Link href={`/clients/${client.id}/edit`}>
                    <Button variant="outline">
                      <Edit className="w-4 h-4 mr-2" />
                      Modifier
                    </Button>
                  </Link>

                  {canDelete && (
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={loading}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Supprimer
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {client.isSelfEntity && (
          <Alert className="mb-6">
            <AlertDescription>
              Ceci est l'entité de votre entreprise. Pour la modifier, allez
              dans les paramètres de l'entreprise.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Basic Info */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Informations</h2>

              <div className="space-y-4">
                {client.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <a
                        href={`mailto:${client.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {client.email}
                      </a>
                    </div>
                  </div>
                )}

                {client.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Téléphone</p>
                      <a
                        href={`tel:${client.phone}`}
                        className="text-blue-600 hover:underline"
                      >
                        {client.phone}
                      </a>
                    </div>
                  </div>
                )}

                {client.website && (
                  <div className="flex items-start gap-3">
                    <Globe className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Site web</p>
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                        title={client.website}
                      >
                        {client.website.length > 40
                          ? client.website.slice(0, 37) + "..."
                          : client.website}
                      </a>
                    </div>
                  </div>
                )}

                {(client.address || client.city) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Adresse</p>
                      <p className="text-gray-900">
                        {client.address}
                        {client.city && (
                          <>
                            <br />
                            {client.postalCode} {client.city}
                          </>
                        )}
                        {client.country && (
                          <>
                            <br />
                            {client.country}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {client.companyType && (
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Type</p>
                      <Badge variant="outline">{client.companyType}</Badge>
                    </div>
                  </div>
                )}

                {client.denomination && (
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-500">Dénomination</p>
                      <p className="text-gray-900">{client.denomination}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Social Networks */}
            {client.socialNetworks && client.socialNetworks.length > 0 && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Réseaux sociaux</h2>
                <div className="space-y-3">
                  {client.socialNetworks.map((network: any) => {
                    const Icon = getSocialIcon(network.type);
                    return (
                      <a
                        key={network.id}
                        href={network.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Icon className="w-5 h-5 text-gray-600" />
                        <span className="text-sm font-medium">
                          {network.type}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Stats */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Statistiques</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Fichiers</span>
                  </div>
                  <span className="font-semibold">
                    {client.stats.totalFiles}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Membres</span>
                  </div>
                  <span className="font-semibold">
                    {client.stats.totalMembers}
                  </span>
                </div>

                <div className="pt-3 border-t">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Créé le{" "}
                      {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column - Tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
                <TabsTrigger value="members">
                  Membres ({client.stats.totalMembers})
                </TabsTrigger>
                <TabsTrigger value="declaration">
                  Reporting Financier ({client.stats.totalComptablePeriods})
                </TabsTrigger>
                <TabsTrigger value="files">
                  Autres fichiers ({client.stats.totalFiles})
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold mb-4">Description</h2>
                  {client.description ? (
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {client.description}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic">
                      Aucune description disponible
                    </p>
                  )}

                  {client.createdBy && (
                    <div className="mt-6 pt-6 border-t">
                      <p className="text-sm text-gray-500 mb-2">Créé par</p>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-600">
                            {client.createdBy.firstName?.[0] ||
                              client.createdBy.email[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {client.createdBy.firstName &&
                            client.createdBy.lastName
                              ? `${client.createdBy.firstName} ${client.createdBy.lastName}`
                              : client.createdBy.email}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(client.createdAt).toLocaleDateString(
                              "fr-FR",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              </TabsContent>

              {/* Members Tab */}
              <TabsContent value="members">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Membres assignés</h2>
                    {canEdit && (
                      <Link href={`/clients/${client.id}/assign`}>
                        <Button size="sm">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Gérer les membres
                        </Button>
                      </Link>
                    )}
                  </div>

                  {client.assignedMembers &&
                  client.assignedMembers.length > 0 ? (
                    <div className="space-y-3">
                      {client.assignedMembers.map((member: any) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="font-medium text-blue-600">
                                {member.firstName?.[0] ||
                                  member.email[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">
                                {member.firstName && member.lastName
                                  ? `${member.firstName} ${member.lastName}`
                                  : member.email}
                              </p>
                              <p className="text-sm text-gray-500">
                                {member.email}
                              </p>
                            </div>
                          </div>
                          <Badge>{member.role}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">Aucun membre assigné</p>
                      {canEdit && (
                        <Link href={`/clients/${client.id}/assign`}>
                          <Button variant="outline" className="mt-4">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Assigner des membres
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </Card>
              </TabsContent>

              {/* Declaration Tab */}
              <DeclarationTabs clientId={client.id} />

              {/* Files Tab */}
              <FilesTabs clientId={client.id} />
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
