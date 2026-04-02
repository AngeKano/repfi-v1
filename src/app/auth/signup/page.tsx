// app/auth/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

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
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // Company fields (Step 1)
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [packType, setPackType] = useState("ENTREPRISE");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");

  // Admin fields (Step 2)
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!companyName || !companyEmail || !companyType) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-[#00122E] mb-2">
            Inscription réussie !
          </h2>
          <p className="text-[#335890] mb-4">
            Votre entreprise a été créée avec succès.
          </p>
          <p className="text-sm text-[#335890]">
            Redirection vers la page de connexion...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Background Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image
          src="/signin-background.png"
          alt="Click Insight"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Right Side - Signup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-white relative overflow-hidden">
        {/* Background watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
          <Image
            src="/logo-click-insight-light.png"
            alt=""
            width={600}
            height={600}
            className="object-contain"
          />
        </div>

        <div className="w-full max-w-md relative z-10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logo-click-insight.png"
              alt="Click Insight"
              width={160}
              height={70}
              className="object-contain"
            />
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-[#00122E] italic">
              Créez votre compte
            </h1>
            {/* Step indicator */}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step >= 1
                      ? "bg-[#0077C3] text-white"
                      : "bg-[#E2E8F0] text-[#94A3B8]"
                  }`}
                >
                  1
                </div>
                <span className="text-sm text-[#335890]">Entreprise</span>
              </div>
              <div className="flex-1 h-0.5 bg-[#E2E8F0]">
                <div
                  className={`h-full transition-all duration-300 ${
                    step >= 2 ? "w-full bg-[#0077C3]" : "w-0"
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step >= 2
                      ? "bg-[#0077C3] text-white"
                      : "bg-[#E2E8F0] text-[#94A3B8]"
                  }`}
                >
                  2
                </div>
                <span className="text-sm text-[#335890]">Administrateur</span>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1 - Company Information */}
          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">
                  Nom de l&apos;entreprise{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  placeholder="Cabinet Comptable XYZ"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                  required
                  className="h-12 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyEmail">
                  Email de l&apos;entreprise{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="companyEmail"
                  type="email"
                  placeholder="contact@entreprise.com"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="h-12 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyType">
                  Type d&apos;entreprise{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={companyType}
                  onValueChange={setCompanyType}
                  disabled={loading}
                  required
                >
                  <SelectTrigger className="h-12 bg-[#F8FAFC] border-[#E2E8F0]">
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
                <Label htmlFor="companyPhone">Téléphone</Label>
                <Input
                  id="companyPhone"
                  type="tel"
                  placeholder="+225 1 23 45 67 89"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  disabled={loading}
                  className="h-12 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full mt-6"
                disabled={loading}
              >
                Continuer
              </Button>

              <div className="text-center mt-4">
                <Link
                  href="/auth/signin"
                  className="text-sm text-[#0077C3] hover:text-[#005992]"
                >
                  Déjà un compte ? Se connecter
                </Link>
              </div>
            </form>
          )}

          {/* Step 2 - Admin Information */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminLastName">
                  Nom de l&apos;administrateur
                </Label>
                <Input
                  id="adminLastName"
                  placeholder="Dupont"
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  disabled={loading}
                  className="h-12 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminFirstName">
                  Prénom de l&apos;administrateur
                </Label>
                <Input
                  id="adminFirstName"
                  placeholder="Jean"
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  disabled={loading}
                  className="h-12 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">
                  Email de l&apos;administrateur{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@entreprise.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="h-12 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">
                  Mot de passe <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="h-12 bg-[#F8FAFC] border-[#E2E8F0] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPasswordConfirm">
                  Confirmation du mot de passe{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="adminPasswordConfirm"
                    type={showPasswordConfirm ? "text" : "password"}
                    placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                    value={adminPasswordConfirm}
                    onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                    disabled={loading}
                    required
                    className="h-12 bg-[#F8FAFC] border-[#E2E8F0] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showPasswordConfirm ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-full px-6"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 text-base bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Création...
                    </>
                  ) : (
                    "Créer le compte"
                  )}
                </Button>
              </div>

              <div className="text-center mt-4">
                <Link
                  href="/auth/signin"
                  className="text-sm text-[#0077C3] hover:text-[#005992]"
                >
                  Retour à la connexion
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
