"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle, Clock, XCircle, Eye } from "lucide-react";
import Link from "next/link";

export default function TimelinePage({
  params,
}: {
  params: { clientId: string };
}) {
  const [periods, setPeriods] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/files/comptable/periods?clientId=${params.clientId}`)
      .then((res) => res.json())
      .then((data) => setPeriods(data.periods || []));
  }, [params.clientId]);

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Timeline des Périodes</h1>

      <div className="space-y-4">
        {periods.map((period) => (
          <Card key={period.id} className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Calendar className="w-8 h-8 text-gray-400" />
                <div>
                  <h3 className="font-semibold">
                    {new Date(period.periodStart).toLocaleDateString("fr-FR")} au{" "}
                    {new Date(period.periodEnd).toLocaleDateString("fr-FR")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Créé le {new Date(period.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    period.status === "COMPLETED"
                      ? "default"
                      : period.status === "FAILED"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {period.status}
                </Badge>
                <Link href={`/clients/${params.clientId}/declaration/status/${period.batchId}`}>
                  <Button size="sm" variant="outline">
                    <Eye className="w-4 h-4 mr-2" />
                    Voir
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}