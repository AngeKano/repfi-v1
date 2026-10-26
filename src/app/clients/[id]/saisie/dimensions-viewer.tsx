"use client";

// ============================================================================
// Référentiels — consultation, filtres et modification ligne à ligne,
// depuis l'onglet Comptabilité (le dépôt de fichiers reste dans Import).
//
// Même présentation que le grand livre : recherche, panneau « Filtres » avec
// une sélection multiple par champ, tri par colonne, pagination numérotée. Le
// bouton « Modifier » d'une ligne rend ses champs éditables ; la clé reste
// verrouillée et aucune ligne ne peut être supprimée. Une modification du
// mapping (PLE) s'applique aux écritures déjà chargées après leur
// reclassement, lancé depuis ce même écran. « Télécharger » exporte le
// référentiel filtré au format attendu pour une mise à jour par fichier.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Pencil,
  Save,
  Search,
  SlidersHorizontal,
  X,
  Download,
  RefreshCw,
  AlertTriangle,
  Plus,
} from "lucide-react";
import {
  PiBooksDuotone,
  PiListChecksDuotone,
  PiTreeStructureDuotone,
  PiUsersThreeDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  REFERENTIELS,
  colonneCle,
  colonnesCles,
  identifiantLigne,
  preparerNouvelleLigne,
  referentielParId,
  type ColonneDimension,
} from "@/lib/comptable/dimensions";
import { MultiSelect, type OptionFiltre } from "./gl-filters-panel";

type Ligne = Record<string, string>;
type Filtres = Record<string, string[]>;

interface PageReferentiel {
  lignes: Ligne[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  canEdit: boolean;
  options?: Record<string, OptionFiltre[]>;
  /** Anomalie de lecture expliquée par le serveur (schéma inattendu). */
  diagnostic?: string;
}

const ICONES: Record<string, React.ElementType> = {
  PLAN_COMPTES: PiBooksDuotone,
  PLE: PiTreeStructureDuotone,
  PLAN_TIERS: PiUsersThreeDuotone,
  CODE_JOURNAL: PiListChecksDuotone,
};

function pageWindow(current: number, total: number, size = 5): (number | "…")[] {
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(size / 2));
  const end = Math.min(total, start + size - 1);
  start = Math.max(1, end - size + 1);
  const out: (number | "…")[] = [];
  if (start > 1) {
    out.push(1);
    if (start > 2) out.push("…");
  }
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total) {
    if (end < total - 1) out.push("…");
    out.push(total);
  }
  return out;
}

const nbFiltresActifs = (f: Filtres) => Object.values(f).reduce((n, v) => n + v.length, 0);

export default function DimensionsViewer({
  clientId,
  version = 0,
}: {
  clientId: string;
  /** Incrémenter pour forcer un rechargement (ex. fin d'une mise à jour). */
  version?: number;
}) {
  const [refId, setRefId] = useState<string>(REFERENTIELS[0].id);
  // Données étiquetées par le référentiel demandé : des lignes d'un onglet ne
  // sont jamais rendues avec les colonnes d'un autre.
  const [donnees, setDonnees] = useState<{ ref: string; page: PageReferentiel } | null>(null);
  // Numéro de la dernière requête : une réponse plus ancienne, arrivée en
  // retard, est ignorée.
  const derniereRequete = useRef(0);
  const [options, setOptions] = useState<Record<string, OptionFiltre[]>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filtres, setFiltres] = useState<Filtres>({});
  const [showFiltres, setShowFiltres] = useState(false);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Les valeurs proposées par les filtres ne sont recalculées qu'au changement
  // de référentiel (ou après une modification), pas à chaque page.
  const [optionsAJour, setOptionsAJour] = useState(false);

  // Édition : une seule ligne à la fois.
  const [edition, setEdition] = useState<{ id: string; cle: string; valeurs: Ligne } | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  // Ligne en cours d'ajout (null = formulaire fermé).
  const [ajout, setAjout] = useState<Ligne | null>(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);
  // Mapping modifié ligne à ligne depuis cet écran : reclassement à lancer.
  const [mappingModifie, setMappingModifie] = useState(false);
  const [reclassementEnCours, setReclassementEnCours] = useState(false);

  const def = referentielParId(refId)!;
  const cle = colonneCle(def).nom;
  // Seules les données du référentiel affiché sont utilisées.
  const data = donnees?.ref === refId ? donnees.page : null;
  const setData = (maj: (d: PageReferentiel | null) => PageReferentiel | null) =>
    setDonnees((prev) => {
      if (!prev || prev.ref !== refId) return prev;
      const page = maj(prev.page);
      return page ? { ref: refId, page } : null;
    });

  const charger = useCallback(async () => {
    const requete = ++derniereRequete.current;
    const ref = refId;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), sortDir });
      if (search) qs.set("search", search);
      if (sortBy) qs.set("sortBy", sortBy);
      for (const [col, valeurs] of Object.entries(filtres))
        valeurs.forEach((v) => qs.append(`f.${col}`, v));
      if (!optionsAJour) qs.set("options", "1");

      const res = await fetch(`/api/clients/${clientId}/dimensions/tables/${refId}?${qs}`);
      if (!res.ok) throw new Error();
      const json = (await res.json()) as PageReferentiel;
      // Une requête plus récente a été lancée entre-temps : on l'attend.
      if (requete !== derniereRequete.current) return;
      setDonnees({ ref, page: { ...json, lignes: Array.isArray(json.lignes) ? json.lignes : [] } });
      if (json.options) {
        setOptions(json.options);
        setOptionsAJour(true);
      }
    } catch {
      if (requete === derniereRequete.current) toast.error("Erreur lors du chargement du référentiel");
    } finally {
      if (requete === derniereRequete.current) setLoading(false);
    }
    // optionsAJour est volontairement exclu : le basculer ne doit pas recharger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refId, page, search, sortBy, sortDir, filtres]);

  useEffect(() => {
    charger();
  }, [charger, version]);

  // Recherche différée, comme dans le grand livre.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const changerReferentiel = (id: string) => {
    if (id === refId) return;
    setRefId(id);
    setPage(1);
    setSearchInput("");
    setSearch("");
    setFiltres({});
    setOptions({});
    setOptionsAJour(false);
    setSortBy("");
    setSortDir("asc");
    setEdition(null);
    setAjout(null);
  };

  const appliquerFiltres = (f: Filtres) => {
    setFiltres(f);
    setPage(1);
  };

  const toggleSort = (col: string) => {
    if ((sortBy || cle) === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  /** Export Excel de toutes les lignes filtrées, colonnes au format du fichier. */
  const telecharger = async () => {
    setExportEnCours(true);
    try {
      const qs = new URLSearchParams({ export: "1", sortDir });
      if (search) qs.set("search", search);
      if (sortBy) qs.set("sortBy", sortBy);
      for (const [col, valeurs] of Object.entries(filtres))
        valeurs.forEach((v) => qs.append(`f.${col}`, v));
      const res = await fetch(`/api/clients/${clientId}/dimensions/tables/${refId}?${qs}`);
      if (!res.ok) throw new Error();
      const json = (await res.json()) as PageReferentiel;

      // En-têtes = noms techniques : le fichier peut être modifié puis
      // redéposé tel quel dans Import pour une mise à jour par fichier.
      // Les colonnes calculées (compte centralisateur) ne font pas partie du format de dépôt.
      const colonnes = def.colonnesFichier ?? def.colonnes.filter((c) => !c.calculee).map((c) => c.nom);
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([
        colonnes,
        ...json.lignes.map((l) => colonnes.map((c) => l[c] ?? "")),
      ]);
      ws["!cols"] = colonnes.map((c) => ({ wch: c.startsWith("intitule") ? 45 : 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, def.label.slice(0, 31));
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const url = URL.createObjectURL(
        new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${def.table}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Échec du téléchargement");
    } finally {
      setExportEnCours(false);
    }
  };

  /** Réapplique le mapping actuel aux écritures déjà chargées (Airflow). */
  const reclasser = async () => {
    setReclassementEnCours(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dimensions/reclassement`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Le reclassement n'a pas pu démarrer");
        return;
      }
      setMappingModifie(false);
      toast.success("Reclassement lancé — suivi dans l'onglet Import, historique des mises à jour.");
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setReclassementEnCours(false);
    }
  };

  /** Ajoute la ligne saisie : contrôle immédiat, puis contrôle serveur qui fait foi. */
  const ajouter = async () => {
    if (!ajout) return;
    const prep = preparerNouvelleLigne(def, ajout);
    if ("erreur" in prep) {
      toast.error(prep.erreur);
      return;
    }
    setAjoutEnCours(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dimensions/tables/${refId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeurs: prep.ligne }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Ajout refusé");
        return;
      }
      const reports: string[] = [];
      if (json.grandLivre?.length) reports.push("grand livre");
      if (json.saisies > 0) reports.push(`${json.saisies} écriture(s) saisie(s)`);
      toast.success(
        `${def.label} : ligne ${prep.ligne[cle]} ajoutée` +
          (reports.length ? ` — reportée sur : ${reports.join(", ")}.` : "."),
      );
      if (json.reclassementRequis) setMappingModifie(true);
      setAjout(null);
      // La nouvelle valeur doit apparaître dans la table et dans les filtres.
      setOptionsAJour(false);
      charger();
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setAjoutEnCours(false);
    }
  };

  /** Champ de saisie d'une nouvelle ligne, selon le type de la colonne. */
  const champAjout = (c: ColonneDimension) => {
    // Champ calculé : rien à saisir, il se déduit du grand livre.
    if (c.calculee) return <span className="text-xs text-muted-foreground italic">Calculé</span>;
    const valeur = ajout?.[c.nom] ?? "";
    const maj = (v: string) => setAjout((a) => (a ? { ...a, [c.nom]: v } : a));
    if (c.choix) {
      // Radix n'accepte pas de valeur vide : « (vide) » passe par une sentinelle.
      const VIDE = "__vide__";
      return (
        <Select value={valeur === "" ? VIDE : valeur} onValueChange={(v) => maj(v === VIDE ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {c.choix.map((x) => (
              <SelectItem key={x || VIDE} value={x || VIDE}>
                {x || "(vide)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={valeur}
        inputMode={c.entier ? "numeric" : undefined}
        list={c.categorie ? `referentiel-${refId}-${c.nom}` : undefined}
        maxLength={255}
        placeholder={c.defautLongueurDe ? "auto" : c.libelle}
        autoFocus={c.nom === cle}
        onChange={(e) => maj(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") ajouter();
          if (e.key === "Escape") setAjout(null);
        }}
        className={cn(
          "h-8 text-xs",
          c.entier ? "w-20" : c.categorie || c.cle ? "w-36" : "w-full min-w-[240px]",
        )}
      />
    );
  };

  const ouvrirAjout = () => {
    setEdition(null);
    // Valeurs initiales : la première valeur proposée pour les listes.
    setAjout(
      Object.fromEntries(def.colonnes.map((c) => [c.nom, c.choix ? c.choix[0] : ""])),
    );
  };

  const enregistrer = async () => {
    if (!edition) return;
    // N'envoie que les champs éditables effectivement changés.
    const origine = data?.lignes.find((l) => identifiantLigne(def, l) === edition.id);
    const valeurs: Record<string, string> = {};
    for (const c of def.colonnes) {
      if (!c.editable) continue;
      const v = (edition.valeurs[c.nom] ?? "").trim();
      if (c.requis && !v) {
        toast.error(`${c.libelle} obligatoire.`);
        return;
      }
      if (v !== (origine?.[c.nom] ?? "")) valeurs[c.nom] = v;
    }
    if (Object.keys(valeurs).length === 0) {
      setEdition(null);
      return;
    }

    setEnregistrement(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dimensions/tables/${refId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // La ligne est désignée par toutes ses colonnes clés (composite pour le mapping).
        body: JSON.stringify({
          cles: Object.fromEntries(
            colonnesCles(def).map((c) => [c.nom, origine?.[c.nom] ?? ""]),
          ),
          valeurs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Modification refusée");
        return;
      }
      // Mise à jour en place de la ligne, sans recharger la page.
      setData((d) =>
        d
          ? {
              ...d,
              lignes: d.lignes.map((l) =>
                identifiantLigne(def, l) === edition.id
                  ? {
                      ...(json.ligne as Ligne),
                      // Les champs calculés ne sont pas renvoyés : on garde leur valeur.
                      ...Object.fromEntries(def.colonnes.filter((c) => c.calculee).map((c) => [c.nom, l[c.nom]])),
                    }
                  : l,
              ),
            }
          : d,
      );
      // Un intitulé ou un type nouveau doit apparaître dans les filtres.
      setOptionsAJour(false);
      if (json.reclassementRequis) setMappingModifie(true);
      const reports: string[] = [];
      if (json.grandLivre?.length) reports.push("grand livre");
      if (json.saisies > 0) reports.push(`${json.saisies} écriture(s) saisie(s)`);
      toast.success(
        `${colonneCle(def).libelle} ${edition.cle} modifié` +
          (reports.length ? ` — reporté sur : ${reports.join(", ")}.` : "."),
      );
      setEdition(null);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setEnregistrement(false);
    }
  };

  const sortTh = (col: string, label: string) => {
    const actif = (sortBy || cle) === col;
    return (
      <th
        key={col}
        onClick={() => toggleSort(col)}
        className="p-2 font-medium text-left cursor-pointer select-none hover:text-[#0077C3] transition-colors"
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {actif ? (
            sortDir === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-40" />
          )}
        </span>
      </th>
    );
  };

  const canEdit = !!data?.canEdit;
  const nbColonnes = def.colonnes.length + (canEdit ? 1 : 0);
  const actifs = nbFiltresActifs(filtres);

  return (
    <Card className="border-[#D0E3F5]">
      <CardHeader>
        <CardTitle>Tables de dimension</CardTitle>
        <CardDescription>
          Plan comptable, mapping des rubriques, plan tiers et codes journaux. Les champs
          se corrigent directement : la clé n&apos;est pas modifiable, aucune ligne n&apos;est
          supprimée, et les intitulés recopiés dans le grand livre et les écritures saisies
          suivent la modification.
        </CardDescription>

        {/* Sous-onglets — même présentation que les États Financiers */}
        <div className="flex flex-wrap items-center gap-6 border-b border-[#D0E3F5] pt-2">
          {REFERENTIELS.map((r) => {
            const Icon = ICONES[r.id] ?? PiBooksDuotone;
            const actif = r.id === refId;
            return (
              <button
                key={r.id}
                onClick={() => changerReferentiel(r.id)}
                className={cn(
                  "flex items-center gap-2 pb-3 text-sm font-medium transition-colors relative",
                  actif ? "text-[#0077C3]" : "text-[#335890] hover:text-[#0077C3]",
                )}
              >
                <Icon className="w-4 h-4" />
                {r.label}
                {actif && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />}
              </button>
            );
          })}
        </div>

        {/* Barre d'outils : recherche + filtres, comme le grand livre */}
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder={`Rechercher (${def.colonnes.map((c) => c.libelle.toLowerCase()).join(", ")})`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 w-80 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFiltres((f) => !f)}
            className="gap-2 h-9"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtres
            {actifs > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {actifs}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={telecharger}
            disabled={exportEnCours}
            className="gap-2 h-9"
            title="Télécharger le référentiel filtré (Excel, format de mise à jour)"
          >
            {exportEnCours ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Télécharger
          </Button>
          {canEdit && (
            <Button
              size="sm"
              onClick={ouvrirAjout}
              disabled={!!ajout || !!edition}
              className="gap-2 h-9 bg-[#0077C3] hover:bg-[#005992]"
              title={`Ajouter une ligne au référentiel « ${def.label} »`}
            >
              <Plus className="w-4 h-4" />
              Ajouter une ligne
            </Button>
          )}
          {def.reclassement && canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={reclasser}
              disabled={reclassementEnCours}
              className="gap-2 h-9"
              title="Reclasser les écritures déjà chargées selon le mapping actuel"
            >
              {reclassementEnCours ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Réappliquer le mapping
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-1">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
              </span>
            ) : (
              `${(data?.total ?? 0).toLocaleString("fr-FR")} ligne(s)`
            )}
          </span>
        </div>

        {def.reclassement && mappingModifie && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 mt-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-[240px]">
              Mapping modifié : les écritures déjà chargées restent classées selon l&apos;ancienne
              version tant qu&apos;elles ne sont pas reclassées.
            </span>
            <Button
              size="sm"
              onClick={reclasser}
              disabled={reclassementEnCours}
              className="h-8 gap-1.5 bg-[#0077C3] hover:bg-[#005992]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réappliquer maintenant
            </Button>
          </div>
        )}

        {/* Panneau de filtres : une sélection multiple par champ de la table */}
        {showFiltres && (
          <div className="space-y-3 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {def.colonnes.map((c) => (
                <MultiSelect
                  key={c.nom}
                  label={c.libelle}
                  options={options[c.nom] ?? []}
                  selected={filtres[c.nom] ?? []}
                  onChange={(v) => appliquerFiltres({ ...filtres, [c.nom]: v })}
                />
              ))}
            </div>
            {actifs > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {actifs} filtre{actifs > 1 ? "s" : ""} actif{actifs > 1 ? "s" : ""}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => appliquerFiltres({})}
                >
                  <X className="w-3 h-3 mr-1" /> Réinitialiser
                </Button>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Suggestions pour les champs « catégorie » (type, nature) */}
        {def.colonnes
          .filter((c) => c.categorie)
          .map((c) => (
            <datalist key={c.nom} id={`referentiel-${refId}-${c.nom}`}>
              {(options[c.nom] ?? []).map((o) => (
                <option key={o.code} value={o.code} />
              ))}
            </datalist>
          ))}

        {/* Lecture anormale : le serveur explique pourquoi, plutôt qu'un tableau vide. */}
        {data?.diagnostic && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-words">{data.diagnostic}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {def.colonnes.map((c) => sortTh(c.nom, c.libelle))}
                {canEdit && <th className="p-2 font-medium text-right w-40">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {ajout && (
                <tr className="border-b bg-[#F5F9FF]">
                  {def.colonnes.map((c) => (
                    <td key={c.nom} className="p-2 align-middle">
                      {champAjout(c)}
                    </td>
                  ))}
                  <td className="p-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={ajouter}
                        disabled={ajoutEnCours}
                        className="h-8 gap-1.5 bg-[#0077C3] hover:bg-[#005992]"
                      >
                        {ajoutEnCours ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Ajouter
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAjout(null)}
                        disabled={ajoutEnCours}
                        className="h-8 w-8 p-0"
                        title="Annuler"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {!data || data.lignes.length === 0 ? (
                <tr>
                  <td colSpan={nbColonnes} className="p-6 text-center text-muted-foreground">
                    {loading ? "Chargement…" : "Aucune ligne."}
                  </td>
                </tr>
              ) : (
                data.lignes.map((l, index) => {
                  const idLigne = identifiantLigne(def, l);
                  const enEdition = edition?.id === idLigne;
                  return (
                    <tr
                      key={`${refId}:${index}:${idLigne}`}
                      className={cn("border-b", enEdition && "bg-[#F5F9FF]")}
                    >
                      {def.colonnes.map((c) => (
                        <td key={c.nom} className="p-2 align-middle">
                          {c.nom === cle ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              {enEdition && <Lock className="w-3 h-3 text-muted-foreground" />}
                              {l[c.nom]}
                            </span>
                          ) : enEdition && c.editable ? (
                            <Input
                              value={edition.valeurs[c.nom] ?? ""}
                              list={c.categorie ? `referentiel-${refId}-${c.nom}` : undefined}
                              maxLength={255}
                              autoFocus={c.requis}
                              onChange={(e) =>
                                setEdition((ed) =>
                                  ed
                                    ? { ...ed, valeurs: { ...ed.valeurs, [c.nom]: e.target.value } }
                                    : ed,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") enregistrer();
                                if (e.key === "Escape") setEdition(null);
                              }}
                              className={cn(
                                "h-8 text-xs",
                                c.categorie ? "w-40" : "w-full min-w-[240px]",
                              )}
                            />
                          ) : (
                            <span className={cn(!l[c.nom] && "text-muted-foreground")}>
                              {l[c.nom] || "—"}
                            </span>
                          )}
                        </td>
                      ))}
                      {canEdit && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {enEdition ? (
                            <div className="inline-flex items-center gap-1">
                              <Button
                                size="sm"
                                onClick={enregistrer}
                                disabled={enregistrement}
                                className="h-8 gap-1.5 bg-[#0077C3] hover:bg-[#005992]"
                              >
                                {enregistrement ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5" />
                                )}
                                Enregistrer
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEdition(null)}
                                disabled={enregistrement}
                                className="h-8 w-8 p-0"
                                title="Annuler"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!edition || !!ajout}
                              onClick={() =>
                                setEdition({ id: idLigne, cle: l[cle], valeurs: { ...l } })
                              }
                              className="h-8 gap-1.5 border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF]"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Modifier
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination numérotée */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {data.total.toLocaleString("fr-FR")} ligne{data.total > 1 ? "s" : ""} ·{" "}
              {data.pageSize}/page
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1 || loading}
                className="h-8 w-8 p-0"
                title="Page précédente"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {pageWindow(data.page, data.totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-2 text-muted-foreground select-none">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === data.page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                    disabled={loading}
                    className={cn(
                      "h-8 min-w-8 px-2 tabular-nums",
                      p === data.page && "bg-[#0077C3] hover:bg-[#005992] text-white",
                    )}
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={data.page >= data.totalPages || loading}
                className="h-8 w-8 p-0"
                title="Page suivante"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {def.note && (
          <p className="text-xs text-muted-foreground mt-4">{def.note}</p>
        )}
      </CardContent>
    </Card>
  );
}
