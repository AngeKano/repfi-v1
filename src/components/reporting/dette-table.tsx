"use client";

// ============================================================================
// Tableau « Top 10 » des dettes — partagé entre l'onglet Dettes (par
// fournisseur) et l'onglet Dettes court terme (par type).
// ============================================================================
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TopDette {
  label: string;
  montantDette: number;
  montantRembourse: number;
  solde: number;
  pourcentage: number;
}

export interface TopDetteFournisseur extends TopDette {
  numeroFournisseur: string;
}

function formatCompactOnly(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    const formatted = Math.round(value / 1000)
      .toLocaleString("fr-FR")
      .replace(/ /g, " ");
    return `${formatted}K`;
  }
  return value.toLocaleString("fr-FR").replace(/ /g, " ");
}

export { formatCompactOnly };

// ==================== TABLEAU GÉNÉRIQUE TOP DETTES ====================
export function DetteTable({
  title,
  description,
  firstColLabel,
  icon,
  rows,
  getSubLabel,
}: {
  title: string;
  description: string;
  firstColLabel: string;
  icon: React.ReactNode;
  rows: TopDette[];
  getSubLabel?: (row: TopDette) => string | undefined;
}) {
  // Total du Top 10 : seul le solde est totalisé (le % du total fait 100 %).
  const totalSolde = rows.reduce((s, r) => s + r.solde, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-3">{firstColLabel}</div>
              <div className="col-span-2 text-right">Montant dette</div>
              <div className="col-span-2 text-right">Montant remboursé</div>
              <div className="col-span-2 text-right">Solde</div>
              <div className="col-span-2 text-right">%</div>
            </div>
            {rows.map((row, index) => {
              const sub = getSubLabel?.(row);
              return (
                <div
                  key={`${row.label}-${index}`}
                  className={cn(
                    "grid grid-cols-12 gap-4 p-3 text-sm items-center",
                    index % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  <div className="col-span-1">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                        index === 0 && "bg-orange-100 text-orange-700",
                        index === 1 && "bg-orange-50 text-orange-600",
                        index === 2 && "bg-amber-50 text-amber-600",
                        index > 2 && "bg-gray-100 text-gray-600",
                      )}
                    >
                      {index + 1}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <div className="font-medium truncate">{row.label}</div>
                    {sub && (
                      <div className="text-xs text-muted-foreground">{sub}</div>
                    )}
                  </div>
                  <div className="col-span-2 text-right font-medium text-blue-600">
                    {formatCompactOnly(row.montantDette)}
                  </div>
                  <div className="col-span-2 text-right font-medium text-green-600">
                    {formatCompactOnly(row.montantRembourse)}
                  </div>
                  <div className="col-span-2 text-right font-bold text-orange-600">
                    {formatCompactOnly(row.solde)}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge variant="outline" className="text-xs">
                      {row.pourcentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted font-medium text-sm border-t">
              <div className="col-span-1"></div>
              <div className="col-span-3">Total Top 10</div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right font-bold text-orange-600">
                {formatCompactOnly(totalSolde)}
              </div>
              <div className="col-span-2 text-right">
                <Badge variant="outline" className="text-xs">
                  100%
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mb-2 opacity-20" />
            <p>Aucune dette disponible</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
