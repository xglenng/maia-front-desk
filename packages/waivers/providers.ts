export type ExternalForm = { externalId: string; name: string; url: string; status: string; metadata?: Record<string, unknown> };
type JotformRegion = "STANDARD" | "EU" | "HIPAA";

function jotformBase(region: JotformRegion) {
  if (region === "EU") return "https://eu-api.jotform.com";
  if (region === "HIPAA") return "https://hipaa-api.jotform.com";
  return "https://api.jotform.com";
}

async function jotformRequest<T>(path: string, apiKey: string, region: JotformRegion) {
  const response = await fetch(`${jotformBase(region)}${path}`, { headers: { APIKEY: apiKey, Accept: "application/json" }, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { content?: T; message?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.message || `Jotform API request failed (${response.status}).`);
  return payload.content as T;
}

export async function listJotformForms(apiKey: string, region: JotformRegion): Promise<ExternalForm[]> {
  const forms = await jotformRequest<Array<Record<string, unknown>>>("/user/forms?limit=100&orderby=updated_at", apiKey, region);
  if (!Array.isArray(forms)) return [];
  return forms.map(form => ({
    externalId: String(form.id || ""),
    name: String(form.title || "Untitled Jotform"),
    url: String(form.url || `https://form.jotform.com/${String(form.id || "")}`),
    status: String(form.status || "UNKNOWN"),
    metadata: { updatedAt: form.updated_at ?? null },
  })).filter(form => form.externalId && form.url);
}

export async function getJotformSubmission(apiKey: string, region: JotformRegion, submissionId: string) {
  return jotformRequest<Record<string, unknown>>(`/submission/${encodeURIComponent(submissionId)}`, apiKey, region);
}

export function findJotformAnswer(submission: Record<string, unknown>, fieldName: string) {
  const answers = submission.answers;
  if (!answers || typeof answers !== "object") return null;
  for (const raw of Object.values(answers as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const answer = raw as Record<string, unknown>;
    if (String(answer.name || "") !== fieldName) continue;
    const value = answer.answer;
    return typeof value === "string" ? value : value == null ? null : String(value);
  }
  return null;
}

export function parseJotformCredentials(value: string) {
  const parsed = JSON.parse(value) as { apiKey?: unknown; region?: unknown };
  if (typeof parsed.apiKey !== "string" || !parsed.apiKey) throw new Error("Invalid Jotform credentials.");
  const region = ["STANDARD", "EU", "HIPAA"].includes(String(parsed.region)) ? String(parsed.region) as JotformRegion : "STANDARD";
  return { apiKey: parsed.apiKey, region };
}
