type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

// Read every page: a capped recent list cannot establish identity coverage.
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Missing reconciliation data");
    rows.push(...data);
    if (rows.length > 10_000) throw new Error("Reconciliation exceeds safe row limit");
    if (data.length < pageSize) return rows;
  }
}

type ProfileIdentity = { user_id: string; email: string | null };
type LeadIdentity = { email: string | null };
export type LeadMatch = "matched" | "unmatched" | "missing_email";

// A match is evidence of a shared email, not acquisition or marketing consent.
export function reconcileProfiles(
  profiles: ProfileIdentity[],
  leads: LeadIdentity[],
): {
  profiles_checked: number;
  matched_profiles: number;
  unmatched_profiles: number;
  profiles_without_email: number;
  matches: Map<string, LeadMatch>;
} {
  const normalize = (email: string | null): string => email?.trim().toLowerCase() ?? "";
  const emails = new Set(leads.map((lead) => normalize(lead.email)).filter(Boolean));
  const matches = new Map<string, LeadMatch>();
  let matched = 0;
  let unmatched = 0;
  let missing = 0;
  for (const profile of profiles) {
    const email = normalize(profile.email);
    const match = !email ? "missing_email" : emails.has(email) ? "matched" : "unmatched";
    matches.set(profile.user_id, match);
    if (match === "matched") matched++;
    else if (match === "unmatched") unmatched++;
    else missing++;
  }
  return {
    profiles_checked: profiles.length,
    matched_profiles: matched,
    unmatched_profiles: unmatched,
    profiles_without_email: missing,
    matches,
  };
}
