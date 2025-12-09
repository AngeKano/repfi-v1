"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  FileJson,
  Link2,
  Info,
} from "lucide-react";
import {
  CompteData,
  CompteEnrichi,
  Stats,
  TiersData,
  Transaction,
  TransactionEnrichie,
} from "@/utils/type";
import { handleRetour } from "@/utils/handle-retour";

const FusionGrandLivresApp: React.FC = () => {
  const [fileComptes, setFileComptes] = useState<File | null>(null);
  const [fileTiers, setFileTiers] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [comptesEnrichis, setComptesEnrichis] = useState<CompteEnrichi[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  const handleFileComptesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFileComptes(uploadedFile);
    setError("");
  };

  const handleFileTiersUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFileTiers(uploadedFile);
    setError("");
  };

  const fusionnerGrandLivres = (
    comptesData: CompteData[],
    tiersData: TiersData[]
  ) => {
    // Afficher un aperçu des premières données importées pour vérification
    console.log(comptesData[0], tiersData[0]);
    // Créer un index des transactions du grand livre tiers pour recherche rapide
    const tiersIndex = new Map<string, any>();

    tiersData.forEach((tiers) => {
      tiers.Transactions?.forEach((trans) => {
        // NEWW Clé composite : Compte + Date + Code_Journal + Numero_Piece + Libelle
        const key = `${trans.Compte}|${trans.Date}|${trans.Code_Journal}|${trans.Numero_Piece}|${trans.Libelle_Ecriture}`;
        tiersIndex.set(key, {
          Compte_tiers: tiers.Compte_tiers,
          Intitule_du_tiers: tiers.Intitule_du_tiers,
          Centralisateur: tiers.Centralisateur,
          Type: tiers.Type,
          trans: trans,
        });
      });
    });

    const enrichedComptes: CompteEnrichi[] = [];
    let totalTrans = 0;
    let transAvecTiers = 0;
    let transSansTiers = 0;

    comptesData.forEach((compte) => {
      const enrichedTransactions: TransactionEnrichie[] = [];

      compte.Transactions?.forEach((trans: Transaction) => {
        totalTrans++;

        // Rechercher la transaction correspondante dans le grand livre tiers
        //NEWW key Compte
        const key = `${trans.Compte}|${trans.Date}|${trans.Code_Journal}|${trans.Numero_Piece}|${trans.Libelle_Ecriture}`;
        const tiersInfo = tiersIndex.get(key);

        if (tiersInfo) {
          // Transaction trouvée dans le grand livre tiers
          transAvecTiers++;
          enrichedTransactions.push({
            ...trans,
            Compte_tiers: tiersInfo.Compte_tiers,
            Intitule_du_tiers: tiersInfo.Intitule_du_tiers,
            Centralisateur: tiersInfo.Centralisateur,
            Type: tiersInfo.Type,
            Statut_Jointure: "Trouvé",
          });
        } else {
          // Transaction non trouvée dans le grand livre tiers
          transSansTiers++;
          enrichedTransactions.push({
            ...trans,
            Statut_Jointure: "Non trouvé",
          });
        }
      });

      enrichedComptes.push({
        Numero_Compte: compte.Numero_Compte,
        Libelle_Compte: compte.Libelle_Compte,
        Periode: compte.Periode,
        Transactions: enrichedTransactions,
      });
    });

    return {
      enrichedComptes,
      stats: {
        totalTransactionsComptes: totalTrans,
        transactionsAvecTiers: transAvecTiers,
        transactionsSansTiers: transSansTiers,
        comptesTraites: comptesData.length,
      },
    };
  };

  const handleProcess = async () => {
    if (!fileComptes || !fileTiers) {
      setError("Veuillez uploader les deux fichiers (Comptes et Tiers)");
      return;
    }

    setProcessing(true);
    setError("");

    try {
      // Lire le fichier Grand Livre Comptes (Excel)
      const arrayBufferComptes = await fileComptes.arrayBuffer();
      const workbookComptes = XLSX.read(arrayBufferComptes);
      const sheetComptes =
        workbookComptes.Sheets[workbookComptes.SheetNames[0]];
      const dataComptes = XLSX.utils.sheet_to_json(sheetComptes);

      // Lire le fichier Grand Livre Tiers (Excel)
      const arrayBufferTiers = await fileTiers.arrayBuffer();
      const workbookTiers = XLSX.read(arrayBufferTiers);
      const sheetTiers = workbookTiers.Sheets[workbookTiers.SheetNames[0]];
      const dataTiers = XLSX.utils.sheet_to_json(sheetTiers);

      // Restructurer les données par compte/tiers
      const comptesGrouped = new Map<string, any>();
      dataComptes.forEach((row: any) => {
        const compte = row.Numero_Compte;
        if (!comptesGrouped.has(compte)) {
          comptesGrouped.set(compte, {
            Numero_Compte: compte,
            Libelle_Compte: row.Libelle_Compte,
            Periode: row.Periode,
            Transactions: [],
          });
        }
        comptesGrouped.get(compte).Transactions.push({
          Date_GL: row.Date_GL,
          Entite: row.Entite,
          Compte: row.Compte,
          Date: row.Date,
          Code_Journal: row.Code_Journal,
          Numero_Piece: row.Numero_Piece,
          Libelle_Ecriture: row.Libelle_Ecriture,
          Debit: row.Debit || 0,
          Credit: row.Credit || 0,
          Solde: row.Solde || 0,
        });
      });

      const tiersGrouped = new Map<string, any>();
      dataTiers.forEach((row: any) => {
        const tiers = row.Compte_tiers;
        if (!tiersGrouped.has(tiers)) {
          tiersGrouped.set(tiers, {
            Compte_tiers: tiers,
            Type: row.Type,
            Intitule_du_tiers: row.Intitule_du_tiers,
            Centralisateur: row.Centralisateur,
            Periode: row.Periode,
            Transactions: [],
          });
        }
        tiersGrouped.get(tiers).Transactions.push({
          Date_GL: row.Date_GL,
          Entite: row.Entite,
          Compte: row.Centralisateur, //NEW
          Date: row.Date,
          Code_Journal: row.Code_Journal,
          Numero_Piece: row.Numero_Piece,
          Libelle_Ecriture: row.Libelle_Ecriture,
          Debit: row.Debit || 0,
          Credit: row.Credit || 0,
          Solde: row.Solde || 0,
        });
      });

      const comptesArray = Array.from(comptesGrouped.values());
      const tiersArray = Array.from(tiersGrouped.values());

      const result = fusionnerGrandLivres(comptesArray, tiersArray);

      setComptesEnrichis(result.enrichedComptes);
      setStats(result.stats);
    } catch (err) {
      setError(
        `Erreur: ${err instanceof Error ? err.message : "Erreur inconnue"}`
      );
    } finally {
      setProcessing(false);
    }
  };

  const downloadJSON = () => {
    const json = JSON.stringify(comptesEnrichis, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grand_livre_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const flatData: any[] = [];
    comptesEnrichis.forEach((compte) => {
      compte.Transactions.forEach((trans) => {
        flatData.push({
          Numero_Compte: compte.Numero_Compte,
          Libelle_Compte: compte.Libelle_Compte,
          Periode: compte.Periode,
          Date_GL: trans.Date_GL,
          Entite: trans.Entite,
          Compte: trans.Compte,
          Compte_tiers: trans.Compte_tiers || "",
          Intitule_du_tiers: trans.Intitule_du_tiers || "",
          Type: trans.Type || "",
          Centralisateur: trans.Centralisateur || "",
          Date: trans.Date,
          Code_Journal: trans.Code_Journal,
          Numero_Piece: trans.Numero_Piece,
          Libelle_Ecriture: trans.Libelle_Ecriture,
          Debit: trans.Debit,
          Credit: trans.Credit,
          Solde: trans.Solde,
          Statut_Jointure: trans.Statut_Jointure,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grand Livre Complet");
    XLSX.writeFile(
      wb,
      `grand_livre_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Bouton retour en haut de page */}
        <div className="mb-4">
          <button
            onClick={handleRetour}
            className="flex items-center gap-2 text-violet-700 hover:text-violet-900 font-medium px-3 py-2 rounded transition-colors bg-violet-50 hover:bg-violet-100"
            type="button"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Link2 className="w-8 h-8 text-violet-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Fusion Grand Livre -{" "}
            </h1>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Cette application fusionne :</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>
                    Grand Livre Comptes (Excel complet) - Table principale
                  </li>
                  <li>Grand Livre Tiers (Excel complet) - Enrichissement</li>
                </ul>
                <p className="mt-2">
                  Les transactions sont jointes sur : Date + Code Journal + N°
                  Pièce + Libellé
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Grand Livre Comptes (Excel complet)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileComptesUpload}
                  className="hidden"
                  id="file-comptes-upload"
                />
                <label
                  htmlFor="file-comptes-upload"
                  className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {fileComptes
                        ? fileComptes.name
                        : "Fichier Grand Livre Comptes"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Grand Livre Tiers (Excel complet)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileTiersUpload}
                  className="hidden"
                  id="file-tiers-upload"
                />
                <label
                  htmlFor="file-tiers-upload"
                  className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {fileTiers ? fileTiers.name : "Fichier Grand Livre Tiers"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleProcess}
              disabled={!fileComptes || !fileTiers || processing}
              className="w-full bg-violet-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-violet-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Fusion en cours...
                </>
              ) : (
                <>
                  <Link2 className="w-5 h-5" />
                  Fusionner les fichiers
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {stats && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-700">
                        Fusion réussie !
                      </p>
                      <div className="grid grid-cols-2 gap-3 mt-3 text-sm text-green-600">
                        <div>
                          <span className="font-medium">Comptes traités :</span>{" "}
                          {stats.comptesTraites}
                        </div>
                        <div>
                          <span className="font-medium">
                            Total transactions :
                          </span>{" "}
                          {stats.totalTransactionsComptes}
                        </div>
                        <div>
                          <span className="font-medium">Avec tiers :</span>{" "}
                          {stats.transactionsAvecTiers}
                        </div>
                        <div>
                          <span className="font-medium">Sans tiers :</span>{" "}
                          {stats.transactionsSansTiers}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={downloadJSON}
                    className="bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    Télécharger JSON
                  </button>

                  <button
                    onClick={downloadExcel}
                    className="bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Télécharger Excel
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                  <h3 className="font-medium text-gray-700 mb-3">
                    Aperçu des comptes enrichis :
                  </h3>
                  {comptesEnrichis.slice(0, 3).map((compte, idx) => (
                    <div
                      key={idx}
                      className="mb-4 p-3 bg-white rounded border border-gray-200"
                    >
                      <p className="text-sm font-semibold text-violet-700">
                        {compte.Numero_Compte} - {compte.Libelle_Compte}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {compte.Transactions.length} transaction(s)
                      </p>
                      {compte.Transactions.slice(0, 2).map((trans, tidx) => (
                        <div
                          key={tidx}
                          className="text-xs mt-2 ml-3 p-2 bg-gray-50 rounded"
                        >
                          <p className="text-gray-700">
                            {trans.Date} - {trans.Code_Journal} -{" "}
                            {trans.Libelle_Ecriture.substring(0, 30)}
                          </p>
                          {trans.Compte_tiers && (
                            <p className="text-violet-600 mt-1">
                              → Tiers: {trans.Compte_tiers} -{" "}
                              {trans.Intitule_du_tiers}
                            </p>
                          )}
                          <p
                            className={`mt-1 ${
                              trans.Statut_Jointure === "Trouvé"
                                ? "text-green-600"
                                : "text-orange-600"
                            }`}
                          >
                            Statut: {trans.Statut_Jointure}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Comment ça fonctionne ?
          </h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              <strong>✓ Jointure :</strong> Basée sur Date + Code_Journal +
              Numero_Piece + Libelle_Ecriture
            </p>
            <p>
              <strong>✓ Validation :</strong> Vérification automatique de la
              conformité des attributs
            </p>
            <p>
              <strong>✓ Enrichissement :</strong> Ajout de Compte_tiers,
              Intitule_du_tiers, Type, Centralisateur
            </p>
            <p>
              <strong>✓ Statistiques :</strong> Nombre de transactions avec/sans
              tiers trouvés
            </p>
            <p>
              <strong>✓ Formats :</strong> Export JSON (structuré) et Excel
              (plat)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FusionGrandLivresApp;
