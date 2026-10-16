// ============================================================================
// Client de l'API REST Airflow (authentification Basic).
// Partagé par l'import complet (etl_comptable_clickhouse) et la mise à jour
// unitaire des tables de dimension (etl_dimensions_clickhouse).
// ============================================================================

function config() {
  const url = process.env.AIRFLOW_API_URL;
  const username = process.env.AIRFLOW_USERNAME;
  const password = process.env.AIRFLOW_PASSWORD;
  if (!url || !username || !password) {
    throw new Error("Configuration Airflow manquante");
  }
  return {
    url,
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  };
}

async function erreurAirflow(response: Response): Promise<Error> {
  const error = await response.json().catch(() => ({}));
  return new Error(`Airflow: ${error.detail || response.statusText}`);
}

/** Lance un run du DAG et renvoie son identifiant. */
export async function triggerAirflowDagRun(
  dagId: string,
  conf: Record<string, unknown>,
): Promise<string> {
  const { url, headers } = config();
  const response = await fetch(`${url}/api/v1/dags/${dagId}/dagRuns`, {
    method: "POST",
    headers,
    body: JSON.stringify({ conf }),
  });
  if (!response.ok) throw await erreurAirflow(response);
  const data = await response.json();
  return data.dag_run_id;
}
