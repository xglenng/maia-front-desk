export type WaiverAudience = "ANY" | "ADULT" | "MINOR";
export type WaiverCandidate = {
  id: string;
  artistId: string | null;
  serviceId: string | null;
  audience: string;
  priority: number;
  active: boolean;
};

export function ageOn(dateOfBirth: string | Date | null, onDate: Date) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  let age = onDate.getUTCFullYear() - birth.getUTCFullYear();
  const month = onDate.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && onDate.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export function selectWaiverForm<T extends WaiverCandidate>(candidates: T[], input: { artistId: string; serviceId: string | null; isMinor: boolean | null }): T | null {
  return candidates
    .filter(candidate => candidate.active)
    .filter(candidate => !candidate.artistId || candidate.artistId === input.artistId)
    .filter(candidate => !candidate.serviceId || candidate.serviceId === input.serviceId)
    .filter(candidate => input.isMinor == null ? candidate.audience === "ANY" : candidate.audience === "ANY" || candidate.audience === (input.isMinor ? "MINOR" : "ADULT"))
    .map(candidate => ({ candidate, score: (candidate.serviceId ? 100 : 0) + (candidate.artistId ? 20 : 0) + (candidate.audience !== "ANY" ? 10 : 0) - candidate.priority / 1000 }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

export function appendTrackingToken(formUrl: string, token: string) {
  const url = new URL(formUrl);
  url.searchParams.set("waiverToken", token);
  return url.toString();
}

export function providerSupportsAutomaticCompletion(provider: string) {
  return provider === "JOTFORM";
}
