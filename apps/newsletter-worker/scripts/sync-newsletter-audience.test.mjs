import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, loadProfiles, loadResendContacts, patchSupabaseUnsubscribed } from "./sync-newsletter-audience.mjs";

const email = "patient@example.com";
const profile = { user_id: "profile-1", email, newsletter_subscribed: true, active: true, deleted_at: null };
const contact = { id: "contact-1", email, unsubscribed: false };
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  RESEND_API_KEY: "placeholder",
  RESEND_AUDIENCE_ID: "newsletter-segment",
};

test("aligned audience requires no writes", () => {
  const plan = buildPlan([profile], [contact], [contact]);
  assert.ok(Object.values(plan).every(items => items.length === 0));
});

test("global opt-out wins over database consent and removes only membership", () => {
  const plan = buildPlan([profile], [contact], [{ ...contact, unsubscribed: true }]);
  assert.equal(plan.markDbUnsubscribed.length, 1);
  assert.equal(plan.removeFromSegment.length, 1);
  assert.equal(plan.addToSegment.length + plan.createResendContacts.length, 0);
});

test("segment opt-out is never reactivated", () => {
  const plan = buildPlan([profile], [{ ...contact, unsubscribed: true }], [contact]);
  assert.equal(plan.markDbUnsubscribed.length, 1);
  assert.equal(plan.createResendContacts.length, 0);
});

test("existing global contacts are added to the segment without recreation", () => {
  const plan = buildPlan([profile], [], [contact]);
  assert.equal(plan.addToSegment.length, 1);
  assert.equal(plan.createResendContacts.length, 0);
});

test("unrelated global contacts are left alone", () => {
  const plan = buildPlan([], [], [contact]);
  assert.ok(Object.values(plan).every(items => items.length === 0));
});

for (const fields of [{ active: false }, { active: null }, { deleted_at: "2026-11-01T00:00:00Z" }]) {
  test(`ineligible profile is removed from the newsletter: ${JSON.stringify(fields)}`, () => {
    const plan = buildPlan([{ ...profile, ...fields }], [contact], [contact]);
    assert.equal(plan.removeFromSegment.length, 1);
    assert.equal(plan.addToSegment.length + plan.createResendContacts.length, 0);
  });
}

test("conflicting duplicate profiles fail before mutations", () => {
  assert.throws(() => buildPlan([profile, { ...profile, newsletter_subscribed: false }], [], []), /duplicado/);
});

test("unknown provider opt-out state fails closed", () => {
  assert.throws(() => buildPlan([profile], [], [{ ...contact, unsubscribed: undefined }]), /desconocido/);
});

test("anonymized identities are never created", () => {
  const plan = buildPlan([{ ...profile, email: "deleted+old@invalid.autamedica" }], [], []);
  assert.equal(plan.createResendContacts.length, 0);
});

test("unknown database consent becomes false and is not enrolled", () => {
  const plan = buildPlan([{ ...profile, newsletter_subscribed: null }], [], []);
  assert.equal(plan.markDbNullFalse.length, 1);
  assert.equal(plan.createResendContacts.length, 0);
});

test("provider pagination rejects empty continuation rather than using partial data", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [], has_more: true });
  try {
    await assert.rejects(loadResendContacts(env), /incompleta/);
  } finally { globalThis.fetch = original; }
});

test("provider pagination rejects missing has_more", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [contact] });
  try {
    await assert.rejects(loadResendContacts(env), /no válida/);
  } finally { globalThis.fetch = original; }
});

test("short Supabase pages are continued until the verified count is complete", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const i = calls++;
    assert.equal(options.headers.range, i === 0 ? "0-999" : "1-1000");
    return Response.json([{ ...profile, user_id: `p-${i}`, email: `person${i}@example.com` }], {
      headers: { "content-range": `${i}-${i}/2` },
    });
  };
  try {
    assert.equal((await loadProfiles(env)).length, 2);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("missing Supabase total blocks an incomplete snapshot", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([profile]);
  try {
    await assert.rejects(loadProfiles(env), /no verificable/);
  } finally { globalThis.fetch = original; }
});

test("Resend rate limits retry without concurrent calls", async () => {
  const original = globalThis.fetch;
  const times = [];
  globalThis.fetch = async () => {
    times.push(Date.now());
    if (times.length === 1) return Response.json({}, { status: 429, headers: { "retry-after": "0" } });
    return Response.json({ data: [], has_more: false });
  };
  try {
    await Promise.all([loadResendContacts(env), loadResendContacts(env, false)]);
    assert.equal(times.length, 3);
    assert.ok(times[1] - times[0] >= 550);
    assert.ok(times[2] - times[1] >= 550);
  } finally { globalThis.fetch = original; }
});

test("database opt-out targets stable user id and verifies the updated row", async () => {
  const original = globalThis.fetch;
  let calledUrl;
  globalThis.fetch = async (url) => {
    calledUrl = url;
    return Response.json([{ user_id: profile.user_id }]);
  };
  try {
    await patchSupabaseUnsubscribed(env, { ...profile, email: "MixedCase@example.com" });
    assert.equal(new URL(calledUrl).searchParams.get("user_id"), "eq.profile-1");
    assert.equal(new URL(calledUrl).searchParams.has("email"), false);
  } finally { globalThis.fetch = original; }
});

test("zero updated database rows cannot be reported as success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    await assert.rejects(patchSupabaseUnsubscribed(env, profile), /exactamente/);
  } finally { globalThis.fetch = original; }
});

test("provider error reports omit contact details", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: email }, { status: 400 });
  try {
    await assert.rejects(patchSupabaseUnsubscribed(env, profile), error => {
      assert.equal(error.message.includes(email), false);
      return /HTTP 400/.test(error.message);
    });
  } finally { globalThis.fetch = original; }
});
