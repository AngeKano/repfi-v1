// app/auth/signup/page.tsx
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
import { Building2, User, ArrowLeft, CheckCircle2 } from "lucide-react";
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

export default function SignUpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Company fields
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [packType, setPackType] = useState("ENTREPRISE");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");

  // Admin fields
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (adminPassword !== adminPasswordConfirm) {
      setError("Les mots de passe ne correspondent pas");
      setLoading(false);
      return;
    }

    if (adminPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      setLoading(false);
      return;
    }

    const data = {
      companyName,
      companyEmail: companyEmail.toLowerCase().trim(),
      companyType,
      packType,
      companyPhone: companyPhone || undefined,
      companyWebsite: companyWebsite || undefined,
      companyDescription: companyDescription || undefined,
      adminEmail: adminEmail.toLowerCase().trim(),
      adminPassword,
      adminPasswordConfirm,
      adminFirstName: adminFirstName || undefined,
      adminLastName: adminLastName || undefined,
    };

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Erreur lors de l'inscription");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/signin?registered=true");
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
            Inscription réussie !
          </h2>
          <p className="text-gray-600 mb-4">
            Votre entreprise a été créée avec succès.
          </p>
          <p className="text-sm text-gray-500">
            Redirection vers la page de connexion...
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
          href="/auth/signin"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à la connexion
        </Link>

        <Card className="p-8 shadow-xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              Créer un compte entreprise
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Commencez à gérer votre comptabilité dès aujourd'hui
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Company Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold">
                  Informations de l'entreprise
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="companyName">
                    Nom de l'entreprise <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="companyName"
                    placeholder="Cabinet Comptable XYZ"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyEmail">
                    Email entreprise <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    placeholder="contact@entreprise.com"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Téléphone</Label>
                  <Input
                    id="companyPhone"
                    type="tel"
                    placeholder="+225 1 23 45 67 89"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
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
                  <Label htmlFor="packType">
                    Type de pack <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={packType}
                    onValueChange={setPackType}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTREPRISE">
                        Entreprise (Gestion de clients)
                      </SelectItem>
                      <SelectItem value="SIMPLE">
                        Simple (Auto-entreprise)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="companyWebsite">Site web</Label>
                  <Input
                    id="companyWebsite"
                    type="url"
                    placeholder="https://www.entreprise.com"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="companyDescription">Description</Label>
                  <Textarea
                    id="companyDescription"
                    placeholder="Description de votre activité..."
                    value={companyDescription}
                    onChange={(e) => setCompanyDescription(e.target.value)}
                    disabled={loading}
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Admin Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <User className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold">
                  Administrateur principal
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adminFirstName">Prénom</Label>
                  <Input
                    id="adminFirstName"
                    placeholder="Jean"
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminLastName">Nom</Label>
                  <Input
                    id="adminLastName"
                    placeholder="Dupont"
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="adminEmail">
                    Email administrateur <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@entreprise.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword">
                    Mot de passe <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPasswordConfirm">
                    Confirmer le mot de passe{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="adminPasswordConfirm"
                    type="password"
                    placeholder="••••••••"
                    value={adminPasswordConfirm}
                    onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="space-y-4">
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
                  "Créer mon compte entreprise"
                )}
              </Button>

              <p className="text-xs text-center text-gray-500">
                En créant un compte, vous acceptez nos{" "}
                <Link href="/terms" className="text-blue-600 hover:underline">
                  conditions d'utilisation
                </Link>{" "}
                et notre{" "}
                <Link
                  href="/privacy"
                  className="text-blue-600 hover:underline"
                >
                  politique de confidentialité
                </Link>
                .
              </p>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}