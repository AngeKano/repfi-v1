"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  FileJson,
  FileText,
} from "lucide-react";
import { CompteData, Transaction } from "@/utils/type";
import { formatDate } from "@/utils/parse-date";
import { parseAmount } from "@/utils/parse-amount";
import { handleRetour } from "@/utils/handle-retour";

const GrandLivreComptesApp: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [comptesData, setComptesData] = useState<CompteData[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setError("");
    setComptesData([]);
    setAllTransactions([]);
  };

  const parseGrandLivreComptes = (workbook: XLSX.WorkBook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const parsedComptes: CompteData[] = [];
    const parsedTransactions: Transaction[] = [];

    let entite = "";
    let dateGL = "";
    let periode = "";

    // Extraction des métadonnées depuis l'en-tête
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!entite && row[0]) {
        const firstCell = String(row[0]).trim();
        if (
          firstCell &&
          !firstCell.includes("Date") &&
          !firstCell.includes("Impression") &&
          !firstCell.includes("©")
        ) {
          entite = firstCell;
        }
      }
      if (row.some((cell) => String(cell).includes("Période du"))) {
        const idx = row.findIndex((cell) =>
          String(cell).includes("Période du")
        );
        if (data[i][idx + 1]) {
          const dateFin = String(data[i + 1]?.[idx + 1] || "").trim();
          const match = dateFin.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
          if (match) {
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            periode = `${year}${match[2]}`;
            dateGL = dateFin;
          }
        }
      }
    }

    if (!entite) entite = "ENVOL";
    if (!periode) periode = "202412";
    if (!dateGL) dateGL = "31/12/2024";

    // Parse les comptes et transactions
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || "").trim();
      const col1 = row[1];
      const col2 = String(row[2] || "").trim();

      // Détection d'un compte : col0 = numéro (6 chiffres), col1 = null, col2 = libellé
      if (
        col0 &&
        /^\d{6}$/.test(col0) &&
        col1 === null &&
        col2 &&
        !col2.includes("Total")
      ) {
        const compte: CompteData = {
          Numero_Compte: col0,
          Libelle_Compte: col2,
          Periode: periode,
          Transactions: [],
        };

        // Chercher toutes les transactions de ce compte
        for (let j = i + 1; j < data.length; j++) {
          const transRow = data[j];
          const transCol0 = String(transRow[0] || "").trim();
          const transCol2 = String(transRow[2] || "").trim();

          // Stop si on trouve "Total compte"
          if (transCol2.includes("Total")) break;

          // Stop si on trouve un nouveau compte
          if (transCol0 && /^\d{6}$/.test(transCol0) && transRow[1] === null)
            break;

          // Si c'est une date (DDMMYY) et qu'il y a un code journal, c'est une transaction
          if (/^\d{6}$/.test(transCol0) && transRow[1] !== null) {
            const date = formatDate(transCol0);
            const codeJournal = String(transRow[1] || "").trim();
            const numeroPiece = String(transRow[2] || "").trim();
            const libelle = String(transRow[5] || "").trim();

            // Les montants sont aux colonnes 11 (débit), 14 (crédit), 17 (solde)
            const debit = parseAmount(transRow[11]);
            const credit = parseAmount(transRow[14]);
            const solde = parseAmount(transRow[17]);

            const transaction: Transaction = {
              Date_GL: dateGL,
              Entite: entite,
              Compte: compte.Numero_Compte,
              Date: date,
              Code_Journal: codeJournal,
              Numero_Piece: numeroPiece,
              Libelle_Ecriture: libelle,
              Debit: debit,
              Credit: credit,
              Solde: solde,
            };

            compte.Transactions.push(transaction);
            parsedTransactions.push(transaction);
          }
        }

        if (compte.Transactions.length > 0) {
          parsedComptes.push(compte);
        }
      }
    }

    return { comptesData: parsedComptes, allTransactions: parsedTransactions };
  };

  const handleProcess = async () => {
    if (!file) {
      setError("Veuillez uploader un fichier");
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        cellStyles: true,
        cellDates: true,
        cellNF: true,
        sheetStubs: true,
      });

      const result = parseGrandLivreComptes(workbook);

      if (result.comptesData.length === 0) {
        setError("Aucun compte détecté. Vérifiez le format du fichier.");
        return;
      }

      setComptesData(result.comptesData);
      setAllTransactions(result.allTransactions);
    } catch (err) {
      setError(
        `Erreur: ${err instanceof Error ? err.message : "Erreur inconnue"}`
      );
    } finally {
      setProcessing(false);
    }
  };

  // Download Feature

  const downloadJSON = () => {
    const json = JSON.stringify(comptesData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grand_livre_comptes_${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadListeComptes = () => {
    // Créer une liste des comptes sans les transactions
    const listeComptes = comptesData.map((compte) => ({
      Numero_Compte: compte.Numero_Compte,
      Libelle_Compte: compte.Libelle_Compte,
      Periode: compte.Periode,
    }));

    const ws = XLSX.utils.json_to_sheet(listeComptes);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liste des Comptes");
    XLSX.writeFile(
      wb,
      `liste_comptes_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const downloadListeComptesJSON = () => {
    const listeComptes = comptesData.map((compte) => ({
      Numero_Compte: compte.Numero_Compte,
      Libelle_Compte: compte.Libelle_Compte,
      Periode: compte.Periode,
    }));

    const json = JSON.stringify(listeComptes, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liste_comptes_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelTransactions = () => {
    const ws = XLSX.utils.json_to_sheet(allTransactions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(
      wb,
      `transactions_comptes_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const downloadExcelComplete = () => {
    const flatData: any[] = [];
    comptesData.forEach((compte) => {
      compte.Transactions.forEach((trans) => {
        flatData.push({
          Numero_Compte: compte.Numero_Compte,
          Libelle_Compte: compte.Libelle_Compte,
          Periode: compte.Periode,
          ...trans,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grand Livre Comptes");
    XLSX.writeFile(
      wb,
      `grand_livre_comptes_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Bouton retour */}
        <div className="mb-4">
          <button
            onClick={handleRetour}
            className="flex items-center gap-2 text-emerald-700 hover:text-emerald-900 font-medium px-3 py-2 rounded transition-colors bg-emerald-50 hover:bg-emerald-100"
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
            <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Grand Livre des Comptes - Parser
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier Excel - Grand Livre des Comptes
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {file
                        ? file.name
                        : "Cliquez pour uploader un fichier Excel"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Traitement en cours...
                </>
              ) : (
                <>Analyser le fichier</>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {comptesData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Traitement réussi !
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {comptesData.length} comptes • {allTransactions.length}{" "}
                      transactions
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <button
                    onClick={downloadJSON}
                    className="bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    JSON structuré
                  </button>

                  <button
                    onClick={downloadExcelTransactions}
                    className="bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Excel transactions
                  </button>

                  <button
                    onClick={downloadExcelComplete}
                    className="bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Excel complet
                  </button>

                  <button
                    onClick={downloadListeComptes}
                    className="bg-orange-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Liste Comptes (Excel)
                  </button>

                  <button
                    onClick={downloadListeComptesJSON}
                    className="bg-amber-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    Liste Comptes (JSON)
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                  <h3 className="font-medium text-gray-700 mb-3">
                    Aperçu des comptes :
                  </h3>
                  {comptesData.slice(0, 5).map((compte, idx) => (
                    <div
                      key={idx}
                      className="mb-4 p-3 bg-white rounded border border-gray-200"
                    >
                      <p className="text-sm font-semibold text-emerald-700">
                        {compte.Numero_Compte} - {compte.Libelle_Compte}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        <span className="font-medium">Période:</span>{" "}
                        {compte.Periode} |
                        <span className="font-medium"> Transactions:</span>{" "}
                        {compte.Transactions.length}
                      </p>
                      {compte.Transactions.slice(0, 2).map((trans, tidx) => (
                        <div
                          key={tidx}
                          className="text-xs text-gray-400 ml-3 mt-1"
                        >
                          • {trans.Date} - {trans.Code_Journal} -{" "}
                          {trans.Libelle_Ecriture.substring(0, 35)}
                          {trans.Libelle_Ecriture.length > 35 ? "..." : ""}
                          {trans.Debit > 0 && ` (D: ${trans.Debit})`}
                          {trans.Credit > 0 && ` (C: ${trans.Credit})`}
                        </div>
                      ))}
                    </div>
                  ))}
                  {comptesData.length > 5 && (
                    <p className="text-sm text-gray-500 text-center mt-2">
                      ... et {comptesData.length - 5} autres comptes
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Structure détectée
          </h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              <strong>✓ Comptes :</strong> Ligne avec numéro (6 chiffres) +
              libellé
            </p>
            <p>
              <strong>✓ Transactions :</strong> Lignes avec date DDMMYY + code
              journal
            </p>
            <p>
              <strong>✓ Colonnes :</strong> Date | Code Journal | N° Pièce |
              Libellé | Débit | Crédit | Solde
            </p>
            <p>
              <strong>✓ Formats de sortie :</strong>
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>
                <span className="text-blue-600">JSON structuré</span> -
                Structure complète avec comptes et transactions imbriquées
              </li>
              <li>
                <span className="text-green-600">Excel transactions</span> -
                Liste plate de toutes les transactions
              </li>
              <li>
                <span className="text-purple-600">Excel complet</span> -
                Transactions enrichies avec infos compte
              </li>
              <li>
                <span className="text-orange-600">Liste Comptes Excel</span> -
                Uniquement Numero + Libellé + Période
              </li>
              <li>
                <span className="text-amber-600">Liste Comptes JSON</span> -
                Uniquement Numero + Libellé + Période (JSON)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrandLivreComptesApp;
