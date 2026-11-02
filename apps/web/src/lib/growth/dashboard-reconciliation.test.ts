import { describe, expect, it } from "vitest";
import { readAllPages, reconcileProfiles } from "./dashboard-reconciliation";

describe("Growth profile reconciliation", () => {
  it("matches normalized emails across old and duplicate leads, independent of totals", () => {
    const result = reconcileProfiles([
      { user_id: "one", email: " Ana@Example.com " },
      { user_id: "two", email: "missing@example.com" },
      { user_id: "three", email: " " },
    ], [
      { email: "ana@example.com" }, { email: "ANA@example.com" },
      { email: "other@example.com" }, { email: null },
    ]);
    expect(result).toMatchObject({
      profiles_checked: 3, matched_profiles: 1,
      unmatched_profiles: 1, profiles_without_email: 1,
    });
    expect([...result.matches.values()]).toEqual(["matched", "unmatched", "missing_email"]);
  });

  it("reads beyond both the recent-list limit and the default database row limit", async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const result = await readAllPages(async (from, to) => ({
      data: rows.slice(from, to + 1), error: null,
    }));
    expect(result).toEqual(rows);
  });

  it("does not publish partial reconciliation after a failed later page", async () => {
    await expect(readAllPages(async (from) => from === 0
      ? { data: Array.from({ length: 500 }, () => 1), error: null }
      : { data: null, error: { message: "unavailable" } },
    )).rejects.toThrow("unavailable");
  });

  it("does not interpret missing query data as an empty successful result", async () => {
    await expect(readAllPages(async () => ({ data: null, error: null })))
      .rejects.toThrow("Missing reconciliation data");
  });

  it("fails explicitly when the reconciliation would exceed the scan budget", async () => {
    await expect(readAllPages(async () => ({
      data: Array.from({ length: 500 }, () => 1), error: null,
    }))).rejects.toThrow("safe row limit");
  });
});
