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

/** État d'un run : queued | running | success | failed. */
export async function getAirflowDagRunState(dagId: string, runId: string): Promise<string> {
  const { url, headers } = config();
  const response = await fetch(
    `${url}/api/v1/dags/${dagId}/dagRuns/${encodeURIComponent(runId)}`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) throw await erreurAirflow(response);
  const data = await response.json();
  return String(data.state || "");
}

/**
 * Valeur renvoyée par une tâche (XCom « return_value »).
 *
 * Selon la version d'Airflow, l'API la sert déjà désérialisée (objet) ou sous
 * forme de texte — JSON, ou repr Python d'un dict. On renvoie l'objet quand
 * il est exploitable, sinon le texte brut, à interpréter par l'appelant.
 */
export async function getAirflowTaskReturnValue(
  dagId: string,
  runId: string,
  taskId: string,
): Promise<unknown> {
  const { url, headers } = config();
  const response = await fetch(
    `${url}/api/v1/dags/${dagId}/dagRuns/${encodeURIComponent(runId)}` +
      `/taskInstances/${taskId}/xcomEntries/return_value?deserialize=true`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) throw await erreurAirflow(response);
  const data = await response.json();
  const value = data.value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
