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
  Info,
} from "lucide-react";
import { parseAmount } from "@/utils/parse-amount";
import { formatDate } from "@/utils/parse-date";
import { PlanTiers, TiersData, Transaction } from "@/utils/type";
import { handleRetour } from "@/utils/handle-retour";

const GrandLivreTiersApp: React.FC = () => {
  const [fileGrandLivre, setFileGrandLivre] = useState<File | null>(null);
  const [filePlanTiers, setFilePlanTiers] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [tiersData, setTiersData] = useState<TiersData[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [planTiersCount, setPlanTiersCount] = useState(0);
  const [error, setError] = useState("");


  const handleFileGrandLivreUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFileGrandLivre(uploadedFile);
    setError("");
  };

  const handleFilePlanTiersUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFilePlanTiers(uploadedFile);
    setError("");
  };

  const parseGrandLivreTiers = (
    workbook: XLSX.WorkBook,
    planTiersMap: Map<string, PlanTiers>
  ) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const parsedTiers: TiersData[] = [];
    const parsedTransactions: Transaction[] = [];

    let entite = "";
    let dateGL = "";
    let periode = "";

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

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || "").trim();
      const col1 = row[1];
      const col2 = String(row[2] || "").trim();
      const col3 = String(row[3] || "").trim();

      if (
        col0 &&
        /^[0-9A-Z]+$/.test(col0) &&
        col1 === null &&
        col2 &&
        !col2.includes("Total")
      ) {
        const tiersInfo = planTiersMap.get(col0);

        const tiers: TiersData = {
          Compte_tiers: col0,
          Type: tiersInfo?.Type || "Non défini",
          Intitule_du_tiers: tiersInfo?.Intitule_du_tiers || col2,
          Centralisateur: tiersInfo?.Centralisateur || col3,
          Periode: tiersInfo?.Periode || periode,
          Transactions: [],
        };

        for (let j = i + 1; j < data.length; j++) {
          const transRow = data[j];
          const transCol0 = String(transRow[0] || "").trim();
          const transCol3 = String(transRow[3] || "").trim();

          if (transCol3.includes("Total")) break;
          if (
            transCol0 &&
            /^[0-9A-Z]+$/.test(transCol0) &&
            transRow[1] === null
          )
            break;

          if (/^\d{6}$/.test(transCol0)) {
            const date = formatDate(transCol0);
            const codeJournal = String(transRow[1] || "").trim();
            const numeroPiece = String(transRow[2] || "").trim();
            const libelle = String(transRow[4] || "").trim();
            const debit = parseAmount(transRow[9]);
            const credit = parseAmount(transRow[11]);
            const solde = parseAmount(transRow[14]);

            const transaction: Transaction = {
              Date_GL: dateGL,
              Entite: entite,
              Compte: tiers.Compte_tiers,
              Date: date,
              Code_Journal: codeJournal,
              Numero_Piece: numeroPiece,
              Libelle_Ecriture: libelle,
              Debit: debit,
              Credit: credit,
              Solde: solde,
            };

            tiers.Transactions.push(transaction);
            parsedTransactions.push(transaction);
          }
        }

        if (tiers.Transactions.length > 0) {
          parsedTiers.push(tiers);
        }
      }
    }

    return { tiersData: parsedTiers, allTransactions: parsedTransactions };
  };

  const handleProcess = async () => {
    if (!fileGrandLivre || !filePlanTiers) {
      setError(
        "Veuillez uploader les deux fichiers (Grand Livre + Plan Tiers)"
      );
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const arrayBufferPlan = await filePlanTiers.arrayBuffer();
      const workbookPlan = XLSX.read(arrayBufferPlan);
      const worksheetPlan = workbookPlan.Sheets[workbookPlan.SheetNames[0]];
      const dataPlan = XLSX.utils.sheet_to_json(worksheetPlan);
      const planTiersData: PlanTiers[] = dataPlan.map((item: any) => ({
        Compte_tiers: item["Compte tiers"],
        Type: item["Type"],
        Intitule_du_tiers: item["Intitulé du tiers"],
        Centralisateur: item["Centralisateur"],
        Periode: item["Periode"],
      }));

      const planTiersMap = new Map<string, PlanTiers>();
      planTiersData.forEach((tiers) => {
        planTiersMap.set(tiers.Compte_tiers, tiers);
      });

      setPlanTiersCount(planTiersData.length);

      const arrayBufferGL = await fileGrandLivre.arrayBuffer();
      const workbookGL = XLSX.read(arrayBufferGL, {
        cellStyles: true,
        cellDates: true,
        cellNF: true,
        sheetStubs: true,
      });

      const result = parseGrandLivreTiers(workbookGL, planTiersMap);

      if (result.tiersData.length === 0) {
        setError("Aucun tiers détecté. Vérifiez le format du fichier.");
        return;
      }

      setTiersData(result.tiersData);
      setAllTransactions(result.allTransactions);
    } catch (err) {
      setError(
        `Erreur: ${err instanceof Error ? err.message : "Erreur inconnue"}`
      );
    } finally {
      setProcessing(false);
    }
  };

  const downloadJSON = () => {
    const json = JSON.stringify(tiersData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grand_livre_tiers_${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadListeTiers = () => {
    const listeTiers = tiersData.map((tiers) => ({
      Compte_tiers: tiers.Compte_tiers,
      Type: tiers.Type,
      Intitule_du_tiers: tiers.Intitule_du_tiers,
      Centralisateur: tiers.Centralisateur,
      Periode: tiers.Periode,
    }));

    const ws = XLSX.utils.json_to_sheet(listeTiers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liste des Tiers");
    XLSX.writeFile(
      wb,
      `liste_tiers_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const downloadListeTiersJSON = () => {
    const listeTiers = tiersData.map((tiers) => ({
      Compte_tiers: tiers.Compte_tiers,
      Type: tiers.Type,
      Intitule_du_tiers: tiers.Intitule_du_tiers,
      Centralisateur: tiers.Centralisateur,
      Periode: tiers.Periode,
    }));

    const json = JSON.stringify(listeTiers, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liste_tiers_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelTransactions = () => {
    const ws = XLSX.utils.json_to_sheet(allTransactions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(
      wb,
      `transactions_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const downloadExcelComplete = () => {
    const flatData: any[] = [];
    tiersData.forEach((tiers) => {
      tiers.Transactions.forEach((trans) => {
        flatData.push({
          Compte_tiers: tiers.Compte_tiers,
          Type: tiers.Type,
          Intitule_du_tiers: tiers.Intitule_du_tiers,
          Centralisateur: tiers.Centralisateur,
          Periode: tiers.Periode,
          ...trans,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grand Livre Tiers");
    XLSX.writeFile(
      wb,
      `grand_livre_tiers_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Bouton retour */}
        <div className="mb-4">
          <button
            onClick={handleRetour}
            className="flex items-center gap-2 text-indigo-700 hover:text-indigo-900 font-medium px-3 py-2 rounded transition-colors bg-indigo-50 hover:bg-indigo-100"
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
            <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Grand Livre des Tiers - avec Plan Tiers
            </h1>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">
                  Utilisation du Plan Tiers prédéfini
                </p>
                <p>
                  Les informations (Type, Centralisateur, Période) proviennent
                  du Plan Tiers.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Plan Tiers (Excel)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFilePlanTiersUpload}
                  className="hidden"
                  id="file-plan-upload"
                />
                <label
                  htmlFor="file-plan-upload"
                  className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {filePlanTiers ? filePlanTiers.name : "Plan Tiers"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Grand Livre Tiers (SAGE 100)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileGrandLivreUpload}
                  className="hidden"
                  id="file-gl-upload"
                />
                <label
                  htmlFor="file-gl-upload"
                  className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {fileGrandLivre
                        ? fileGrandLivre.name
                        : "Grand Livre Tiers"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleProcess}
              disabled={!fileGrandLivre || !filePlanTiers || processing}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Traitement en cours...
                </>
              ) : (
                <>Analyser</>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {tiersData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Traitement réussi !
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {tiersData.length} tiers • {allTransactions.length}{" "}
                      transactions • {planTiersCount} tiers dans le plan
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
                    onClick={downloadListeTiers}
                    className="bg-orange-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Liste Tiers (Excel)
                  </button>
                  <button
                    onClick={downloadListeTiersJSON}
                    className="bg-amber-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    Liste Tiers (JSON)
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                  <h3 className="font-medium text-gray-700 mb-3">Aperçu :</h3>
                  {tiersData.slice(0, 5).map((tiers, idx) => (
                    <div key={idx} className="mb-4 p-3 bg-white rounded border">
                      <p className="text-sm font-semibold text-indigo-700">
                        {tiers.Compte_tiers} - {tiers.Intitule_du_tiers}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Type: {tiers.Type} | Centralisateur:{" "}
                        {tiers.Centralisateur}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {tiers.Transactions.length} transaction(s)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrandLivreTiersApp;
