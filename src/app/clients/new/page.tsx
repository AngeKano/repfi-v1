// app/clients/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const COMPANY_TYPES = [
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

const SOCIAL_NETWORKS = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "TWITTER", label: "Twitter" },
];

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Client fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [denomination, setDenomination] = useState("");

  // Social networks
  const [socialNetworks, setSocialNetworks] = useState<
    { type: string; url: string }[]
  >([]);
  const [socialType, setSocialType] = useState("");
  const [socialUrl, setSocialUrl] = useState("");

  const addSocialNetwork = () => {
    if (socialType && socialUrl) {
      setSocialNetworks([
        ...socialNetworks,
        { type: socialType, url: socialUrl },
      ]);
      setSocialType("");
      setSocialUrl("");
    }
  };

  const removeSocialNetwork = (index: number) => {
    setSocialNetworks(socialNetworks.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const data = {
      name,
      email: email.toLowerCase().trim(),
      companyType,
      phone: phone || undefined,
      website: website || undefined,
      description: description || undefined,
      denomination: denomination || undefined,
      socialNetworks: socialNetworks.length > 0 ? socialNetworks : undefined,
    };

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Erreur lors de la création du client");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      setError("Une erreur est survenue. Veuillez réessayer.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Client créé !
          </h2>
          <p className="text-gray-600 mb-4">
            Le client a été créé avec succès.
          </p>
          <p className="text-sm text-gray-500">
            Redirection vers la liste des clients...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Back Button */}
        <Link
          href="/clients"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux clients
        </Link>

        <Card className="p-8 shadow-xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Nouveau client
                </h1>
                <p className="text-sm text-gray-600">
                  Ajoutez un nouveau client à votre portefeuille
                </p>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">
                Informations de base
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">
                    Nom du client <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="Entreprise Client"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@client.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+225 1 23 45 67 89"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyType">
                    Type d'entreprise <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={companyType}
                    onValueChange={setCompanyType}
                    disabled={loading}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
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

                <div className="space-y-2">
                  <Label htmlFor="denomination">Dénomination</Label>
                  <Input
                    id="denomination"
                    placeholder="SARL, SAS, etc."
                    value={denomination}
                    onChange={(e) => setDenomination(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="website">Site web</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://www.client.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Description de l'activité du client..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Social Networks */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">
                Réseaux sociaux (optionnel)
              </h2>

              <div className="flex gap-2">
                <Select
                  value={socialType}
                  onValueChange={setSocialType}
                  disabled={loading || socialNetworks.length >= 3}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOCIAL_NETWORKS.map((network) => (
                      <SelectItem key={network.value} value={network.value}>
                        {network.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="https://..."
                  value={socialUrl}
                  onChange={(e) => setSocialUrl(e.target.value)}
                  disabled={loading || socialNetworks.length >= 3}
                  className="flex-1"
                />

                <Button
                  type="button"
                  onClick={addSocialNetwork}
                  disabled={
                    loading ||
                    !socialType ||
                    !socialUrl ||
                    socialNetworks.length >= 3
                  }
                >
                  Ajouter
                </Button>
              </div>

              {socialNetworks.length > 0 && (
                <div className="space-y-2">
                  {socialNetworks.map((network, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {
                            SOCIAL_NETWORKS.find(
                              (n) => n.value === network.type
                            )?.label
                          }
                        </p>
                        <p className="text-xs text-gray-500">{network.url}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSocialNetwork(index)}
                        disabled={loading}
                      >
                        Retirer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                className="w-full h-12 text-base"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Création en cours...
                  </>
                ) : (
                  "Créer le client"
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
