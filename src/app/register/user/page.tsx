"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function UserRegister() {
  const router = useRouter();
  const [companies, setCompanies] = useState([]);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    companyId: "",
    role: "user",
  });

  useEffect(() => {
    // Charger la liste des entreprises
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => setCompanies(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/user/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      alert("Compte utilisateur créé !");
      router.push("/login");
    } else {
      const error = await res.json();
      alert(error.message || "Erreur");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-6">Inscription Utilisateur</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom complet *</Label>
            <Input
              id="name"
              placeholder="Jean Dupont"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="jean@example.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe *</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyId">Entreprise *</Label>
            <select
              id="companyId"
              className="w-full p-2 border rounded-md"
              value={formData.companyId}
              onChange={(e) =>
                setFormData({ ...formData, companyId: e.target.value })
              }
              required
            >
              <option value="">Sélectionner une entreprise</option>
              {companies.map((company: any) => (
                <option key={company.id} value={company.id}>
                  {company.nom}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" className="w-full">
            Créer le compte
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          <a href="/login" className="text-blue-600 hover:underline">
            Retour à la connexion
          </a>
        </p>
      </Card>
    </div>
  );
}