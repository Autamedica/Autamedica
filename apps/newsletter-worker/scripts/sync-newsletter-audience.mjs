#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const ENV_FILE = new URL(".dev.vars", ROOT);
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const syncBrevoSuppressions = args.has("--brevo");
// Never alter contacts outside the configured newsletter segment.

function normalizeEmail(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isAnonymized(value) {
  return value.startsWith("deleted+") || value.endsWith("@invalid.autamedica");
}

function validEmail(value) {
  return (
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) &&
    !value.includes("..") &&
    !isAnonymized(value)
  );
}

async function loadEnv() {
  const text = await readFile(ENV_FILE, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    env[key.trim()] = rest
      .join("=")
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  Object.assign(env, Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)));
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "RESEND_AUDIENCE_ID",
  ]) {
    if (!env[key])
      throw new Error(`${key} no configurada en ${ENV_FILE.pathname}`);
  }
  return env;
}

// Serialize Resend calls across both pagination streams and writes.
let resendQueue = Promise.resolve();
let nextResendRequest = 0;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function requestJson(url, options = {}) {
  if (new URL(url).hostname !== "api.resend.com") return fetchJson(url, options);
  const task = resendQueue.then(async () => {
    await delay(Math.max(0, nextResendRequest - Date.now()));
    nextResendRequest = Date.now() + 600;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, options);
      if (response.status !== 429 || attempt === 3) return parseResponse(response, options);
      const seconds = Number(response.headers.get("retry-after") ?? 1);
      await response.text();
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) {
        throw new Error("Resend requiere reintentar más tarde; sincronización detenida");
      }
      await delay(Math.max(600, seconds * 1000));
      nextResendRequest = Date.now() + 600;
    }
  });
  resendQueue = task.catch(() => {});
  return task;
}
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  return parseResponse(res, options);
}
async function parseResponse(res, options) {
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!res.ok) {
    // Provider errors and URLs can contain private email addresses.
    throw new Error(
      `${options.method ?? "GET"} falló (HTTP ${res.status})`,
    );
  }
  return body;
}

function supabaseHeaders(env, schema = "public") {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    "accept-profile": schema,
    "content-profile": schema,
  };
}

async function loadProfiles(env) {
  const rows = [];
  const pageSize = 1000;
  let total;
  const select = "user_id,email,first_name,last_name,newsletter_subscribed,active,deleted_at";
  for (let from = 0; ; from = rows.length) {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?select=${select}&email=not.is.null&order=user_id.asc`,
      {
        headers: {
          ...supabaseHeaders(env),
          prefer: "count=exact",
          range: `${from}-${from + pageSize - 1}`,
        },
      },
    );
    const page = await parseResponse(response, {});
    if (!Array.isArray(page)) throw new Error("Respuesta de perfiles no válida");
    const range = response.headers.get("content-range");
    const match = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(range ?? "");
    if (!match) throw new Error("Recuento completo de perfiles no verificable");
    const expected = Number(match[3]);
    if (total !== undefined && expected !== total) throw new Error("La población cambió durante la lectura; reintentar");
    total = expected;
    if (page.length > 0 && (Number(match[1]) !== from || Number(match[2]) !== from + page.length - 1)) {
      throw new Error("Rango de perfiles incompleto");
    }
    rows.push(...page);
    if (rows.length === total) break;
    if (page.length === 0 || rows.length > total) throw new Error("Lectura de perfiles incompleta");
  }
  return rows
    .map((profile) => ({ ...profile, email: normalizeEmail(profile.email) }))
    .filter((profile) => validEmail(profile.email));
}

async function loadResendContacts(env, segmentOnly = true) {
  const rows = [];
  let afterId;
  const segmentId = env.RESEND_AUDIENCE_ID;
  for (;;) {
    // /contacts is GLOBAL on current Resend; audience_id on this URL
    // does not restrict results to a broadcast segment.
    const url = new URL(segmentOnly
      ? `https://api.resend.com/segments/${encodeURIComponent(segmentId)}/contacts`
      : "https://api.resend.com/contacts");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after", afterId);
    const data = await requestJson(url.toString(), {
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        accept: "application/json",
      },
    });
    if (!Array.isArray(data?.data) || typeof data.has_more !== "boolean") {
      throw new Error("Respuesta de contactos Resend no válida");
    }
    rows.push(...data.data);
    if (!data.has_more) break;
    const cursor = data.data.at(-1)?.id;
    if (!cursor || cursor === afterId || rows.slice(0, -data.data.length).some(c => c.id === cursor)) {
      throw new Error("Paginación Resend incompleta o repetida");
    }
    afterId = cursor;
  }
  return rows.map(c => ({ ...c, email: normalizeEmail(c.email) }))
    .filter(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
}

function buildPlan(profiles, segmentContacts, globalContacts) {
  // Refuse ambiguous consent rather than choosing the last matching profile.
  for (const rows of [profiles, segmentContacts, globalContacts]) {
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.email)) throw new Error("Correo normalizado duplicado; resolver identidad antes de sincronizar");
      seen.add(row.email);
    }
  }
  for (const contact of [...segmentContacts, ...globalContacts]) {
    if (!contact.id || typeof contact.unsubscribed !== "boolean") {
      throw new Error("Estado de suscripción Resend desconocido");
    }
  }
  const profileByEmail = new Map(profiles.map(p => [p.email, p]));
  const segmentByEmail = new Map(segmentContacts.map(c => [c.email, c]));
  const globalByEmail = new Map(globalContacts.map(c => [c.email, c]));
  const dbActive = new Set(profiles
    .filter(p => p.newsletter_subscribed === true && p.active === true && p.deleted_at === null && validEmail(p.email))
    .map(p => p.email));

  const markDbUnsubscribedByEmail = new Map();
  const markDbNullFalse = profiles.filter(p => p.newsletter_subscribed === null);
  // A globally unsubscribed contact must remain unsubscribed. Never revive them.
  for (const email of dbActive) {
    const globallyUnsubscribed = globalByEmail.get(email)?.unsubscribed === true;
    const segmentUnsubscribed = segmentByEmail.get(email)?.unsubscribed === true;
    if (globallyUnsubscribed || segmentUnsubscribed) {
      markDbUnsubscribedByEmail.set(email, { profile: profileByEmail.get(email), reason: "resend_unsubscribed" });
      dbActive.delete(email);
    }
  }
  const removeFromSegment = [];
  for (const contact of segmentContacts) {
    if (!dbActive.has(contact.email)) {
      removeFromSegment.push({
        contact,
        reason: profileByEmail.has(contact.email) ? "db_not_subscribed" : "not_in_db",
      });
    }
  }
  const addToSegment = [];
  const createResendContacts = [];
  for (const email of dbActive) {
    const inSegment = segmentByEmail.get(email);
    if (inSegment) continue;
    const profile = profileByEmail.get(email);
    const global = globalByEmail.get(email);
    if (global) addToSegment.push({ profile, contact: global });
    else createResendContacts.push(profile);
  }
  return {
    markDbUnsubscribed: [...markDbUnsubscribedByEmail.values()],
    markDbNullFalse, removeFromSegment, addToSegment, createResendContacts,
  };
}

async function patchSupabaseUnsubscribed(env, profile) {
  if (!profile.user_id) throw new Error("Perfil sin identificador estable");
  const updated = await requestJson(
    `${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(profile.user_id)}&select=user_id`,
    {
      method: "PATCH",
      headers: { ...supabaseHeaders(env), prefer: "return=representation" },
      body: JSON.stringify({
        newsletter_subscribed: false,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!Array.isArray(updated) || updated.length !== 1 || updated[0].user_id !== profile.user_id) {
    throw new Error("La baja no actualizó exactamente el perfil esperado");
  }
}

async function patchGrowthLeadUnsubscribed(env, email) {
  await requestJson(
    `${env.SUPABASE_URL}/rest/v1/leads?email_normalized=eq.${encodeURIComponent(email)}&status=neq.unsubscribed`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders(env, "growth_os"),
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "unsubscribed",
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

function resendHeaders(env) {
  return { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", accept: "application/json" };
}
async function removeContactFromSegment(env, contact) {
  await requestJson(`https://api.resend.com/contacts/${encodeURIComponent(contact.id)}/segments/${encodeURIComponent(env.RESEND_AUDIENCE_ID)}`, {
    method: "DELETE", headers: resendHeaders(env),
  });
}
async function addContactToSegment(env, contact) {
  await requestJson(`https://api.resend.com/contacts/${encodeURIComponent(contact.id)}/segments/${encodeURIComponent(env.RESEND_AUDIENCE_ID)}`, {
    method: "POST", headers: resendHeaders(env),
  });
}
async function createResendContact(env, profile) {
  await requestJson("https://api.resend.com/contacts", {
    method: "POST", headers: resendHeaders(env),
    body: JSON.stringify({
      email: profile.email,
      first_name: profile.first_name ?? undefined,
      last_name: profile.last_name ?? undefined,
      unsubscribed: false,
      segments: [{ id: env.RESEND_AUDIENCE_ID }],
    }),
  });
}

function parseNumberList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

async function brevoSuppress(env, profile) {
  if (!env.BREVO_API_KEY) return;
  const listIds = parseNumberList(env.BREVO_LIST_IDS);
  const encoded = encodeURIComponent(profile.email);
  const headers = {
    "api-key": env.BREVO_API_KEY,
    "content-type": "application/json",
    accept: "application/json",
  };
  const existing = await fetch(`https://api.brevo.com/v3/contacts/${encoded}`, {
    headers,
  });
  if (existing.status === 404) {
    await requestJson("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: profile.email,
        emailBlacklisted: true,
        attributes: {
          FIRSTNAME: profile.first_name ?? "",
          LASTNAME: profile.last_name ?? "",
        },
      }),
    });
    return;
  }
  if (!existing.ok) {
    await existing.text();
    throw new Error(`GET Brevo contact falló (HTTP ${existing.status})`);
  }
  await requestJson(`https://api.brevo.com/v3/contacts/${encoded}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      emailBlacklisted: true,
      ...(listIds.length > 0 ? { unlinkListIds: listIds } : {}),
    }),
  });
}

async function applyPlan(env, plan) {
  const applied = {
    db_unsubscribed: 0, db_null_false: 0,
    segment_removed: 0, segment_added: 0, resend_created: 0,
    growth_leads_unsubscribed: 0, brevo_suppressed: 0,
  };
  for (const item of plan.markDbUnsubscribed) {
    await patchSupabaseUnsubscribed(env, item.profile);
    await patchGrowthLeadUnsubscribed(env, item.profile.email);
    applied.db_unsubscribed++;
    applied.growth_leads_unsubscribed++;
    if (syncBrevoSuppressions) {
      await brevoSuppress(env, item.profile);
      applied.brevo_suppressed++;
    }
  }
  for (const profile of plan.markDbNullFalse) {
    await patchSupabaseUnsubscribed(env, profile);
    applied.db_null_false++;
  }
  for (const item of plan.removeFromSegment) {
    await removeContactFromSegment(env, item.contact);
    applied.segment_removed++;
  }
  for (const item of plan.addToSegment) {
    await addContactToSegment(env, item.contact);
    applied.segment_added++;
  }
  for (const profile of plan.createResendContacts) {
    // Fail closed on API errors, and never suppress a previous global opt-out.
    await createResendContact(env, profile);
    applied.resend_created++;
  }
  return applied;
}

async function main() {
const env = await loadEnv();
const [profiles, segmentContacts, globalContacts] = await Promise.all([
  loadProfiles(env), loadResendContacts(env, true), loadResendContacts(env, false),
]);
const plan = buildPlan(profiles, segmentContacts, globalContacts);

const report = {
  mode: apply ? "apply" : "dry-run",
  brevo_suppressions: syncBrevoSuppressions ? "enabled" : "disabled",
  counts: {
    supabase_profiles_with_email: profiles.length,
    supabase_newsletter_true: profiles.filter(p => p.newsletter_subscribed === true).length,
    resend_segment_contacts: segmentContacts.length,
    resend_segment_active: segmentContacts.filter(c => c.unsubscribed !== true).length,
    resend_global_contacts: globalContacts.length,
  },
  plan: {
    db_from_resend_unsubscribes: plan.markDbUnsubscribed.length,
    db_null_to_false: plan.markDbNullFalse.length,
    segment_to_remove: plan.removeFromSegment.length,
    segment_to_add: plan.addToSegment.length,
    resend_to_create: plan.createResendContacts.length,
  },
};

if (apply) {
  report.applied = await applyPlan(env, plan);
  const [verifiedProfiles, verifiedSegment, verifiedGlobal] = await Promise.all([
    loadProfiles(env), loadResendContacts(env, true), loadResendContacts(env, false),
  ]);
  const remainder = buildPlan(verifiedProfiles, verifiedSegment, verifiedGlobal);
  report.verification = {
    remaining_db_null_false: remainder.markDbNullFalse.length,
    remaining_db_unsubscribes: remainder.markDbUnsubscribed.length,
    remaining_segment_removals: remainder.removeFromSegment.length,
    remaining_segment_additions: remainder.addToSegment.length,
    remaining_contacts_to_create: remainder.createResendContacts.length,
  };
  if (Object.values(report.verification).some(x => x !== 0)) {
    console.error("Sincronización incompleta; envío debe continuar bloqueado", JSON.stringify(report.verification));
    process.exitCode = 1;
  }
}

console.log(JSON.stringify(report, null, 2));
}

export { buildPlan, loadProfiles, loadResendContacts, patchSupabaseUnsubscribed, loadEnv };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
