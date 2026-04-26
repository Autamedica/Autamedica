#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const ENV_FILE = new URL(".dev.vars", ROOT);
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const syncBrevoSuppressions = args.has("--brevo");

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) && !value.includes("..");
}

async function loadEnv() {
  const text = await readFile(ENV_FILE, "utf8");
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
  ]) {
    if (!env[key]) throw new Error(`${key} no configurada en ${ENV_FILE.pathname}`);
  }
  return env;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
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
    const detail = typeof body?.raw === "string" ? body.raw : JSON.stringify(body);
    throw new Error(`${options.method ?? "GET"} ${url} ${res.status}: ${detail}`);
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
  const select = "user_id,email,first_name,last_name,newsletter_subscribed";
  for (let from = 0; ; from += pageSize) {
    const page = await requestJson(
      `${env.SUPABASE_URL}/rest/v1/profiles?select=${select}&email=not.is.null&order=created_at.asc`,
      {
        headers: {
          ...supabaseHeaders(env),
          range: `${from}-${from + pageSize - 1}`,
        },
      },
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows
    .map((profile) => ({ ...profile, email: normalizeEmail(profile.email) }))
    .filter((profile) => validEmail(profile.email));
}

async function loadResendContacts(env) {
  const rows = [];
  let afterId = undefined;
  const audienceId = env.RESEND_AUDIENCE_ID;

  for (;;) {
    const url = new URL("https://api.resend.com/contacts");
    url.searchParams.set("limit", "100");
    if (audienceId) url.searchParams.set("audience_id", audienceId);
    if (afterId) url.searchParams.set("after", afterId);

    const data = await requestJson(url.toString(), {
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        accept: "application/json",
      },
    });
    
    if (Array.isArray(data?.data)) {
      rows.push(...data.data);
      if (!data.has_more || data.data.length === 0) break;
      afterId = data.data[data.data.length - 1].id;
    } else {
      break;
    }
  }
  
  return rows
    .map((contact) => ({ ...contact, email: normalizeEmail(contact.email) }))
    .filter((contact) => validEmail(contact.email));
}

function buildPlan(profiles, resendContacts) {
  const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile]));
  const contactByEmail = new Map(resendContacts.map((contact) => [contact.email, contact]));
  const dbActive = new Set(
    profiles
      .filter((profile) => profile.newsletter_subscribed === true)
      .map((profile) => profile.email),
  );

  const markDbUnsubscribed = [];
  const markDbNullFalse = [];
  const markResendUnsubscribed = [];
  const createResendContacts = [];

  for (const profile of profiles) {
    if (profile.newsletter_subscribed === null) {
      markDbNullFalse.push(profile);
    }
  }

  for (const contact of resendContacts) {
    const profile = profileByEmail.get(contact.email);
    if (contact.unsubscribed === true && profile?.newsletter_subscribed === true) {
      markDbUnsubscribed.push({ profile, reason: "resend_unsubscribed" });
      dbActive.delete(contact.email);
    }
  }

  for (const contact of resendContacts) {
    const profile = profileByEmail.get(contact.email);
    if (contact.unsubscribed !== true && profile?.newsletter_subscribed !== true) {
      markResendUnsubscribed.push({ contact, reason: profile ? "db_not_subscribed" : "not_in_db" });
    }
  }

  for (const email of dbActive) {
    if (!contactByEmail.has(email)) {
      createResendContacts.push(profileByEmail.get(email));
    }
  }

  return {
    markDbUnsubscribed,
    markDbNullFalse,
    markResendUnsubscribed,
    createResendContacts,
  };
}

async function patchSupabaseUnsubscribed(env, email) {
  await requestJson(`${env.SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(env), prefer: "return=minimal" },
    body: JSON.stringify({
      newsletter_subscribed: false,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function patchResendUnsubscribed(env, contact) {
  await requestJson(`https://api.resend.com/contacts/${encodeURIComponent(contact.id)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ unsubscribed: true }),
  });
}

async function createResendContact(env, profile) {
  await requestJson("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email: profile.email,
      firstName: profile.first_name ?? undefined,
      lastName: profile.last_name ?? undefined,
      unsubscribed: false,
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
  const existing = await fetch(`https://api.brevo.com/v3/contacts/${encoded}`, { headers });
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
    const body = await existing.text();
    throw new Error(`GET Brevo contact ${existing.status}: ${body}`);
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
    db_unsubscribed: 0,
    db_null_false: 0,
    resend_unsubscribed: 0,
    resend_created: 0,
    brevo_suppressed: 0,
  };

  for (const item of plan.markDbUnsubscribed) {
    await patchSupabaseUnsubscribed(env, item.profile.email);
    applied.db_unsubscribed += 1;
  }
  for (const profile of plan.markDbNullFalse) {
    await patchSupabaseUnsubscribed(env, profile.email);
    applied.db_null_false += 1;
  }
  for (const item of plan.markResendUnsubscribed) {
    await patchResendUnsubscribed(env, item.contact);
    applied.resend_unsubscribed += 1;
    if (syncBrevoSuppressions) {
      await brevoSuppress(env, item.contact);
      applied.brevo_suppressed += 1;
    }
  }
  for (const profile of plan.createResendContacts) {
    try {
      await createResendContact(env, profile);
      applied.resend_created += 1;
    } catch (error) {
      console.error(`Error creating Resend contact for ${profile.email}:`, error.message);
    }
  }

  return applied;
}

function sample(list, pick) {
  return list.slice(0, 20).map(pick);
}

const env = await loadEnv();
const [profiles, resendContacts] = await Promise.all([
  loadProfiles(env),
  loadResendContacts(env),
]);
const plan = buildPlan(profiles, resendContacts);

const report = {
  mode: apply ? "apply" : "dry-run",
  brevo_suppressions: syncBrevoSuppressions ? "enabled" : "disabled",
  counts: {
    supabase_profiles_with_email: profiles.length,
    supabase_newsletter_true: profiles.filter((profile) => profile.newsletter_subscribed === true).length,
    supabase_newsletter_false: profiles.filter((profile) => profile.newsletter_subscribed === false).length,
    supabase_newsletter_null: profiles.filter((profile) => profile.newsletter_subscribed === null).length,
    resend_contacts: resendContacts.length,
    resend_active: resendContacts.filter((contact) => contact.unsubscribed !== true).length,
    resend_unsubscribed: resendContacts.filter((contact) => contact.unsubscribed === true).length,
  },
  plan: {
    db_from_resend_unsubscribes: plan.markDbUnsubscribed.length,
    db_null_to_false: plan.markDbNullFalse.length,
    resend_to_unsubscribe: plan.markResendUnsubscribed.length,
    resend_to_create: plan.createResendContacts.length,
  },
  samples: {
    db_from_resend_unsubscribes: sample(plan.markDbUnsubscribed, (item) => item.profile.email),
    db_null_to_false: sample(plan.markDbNullFalse, (profile) => profile.email),
    resend_to_unsubscribe: sample(plan.markResendUnsubscribed, (item) => item.contact.email),
    resend_to_create: sample(plan.createResendContacts, (profile) => profile.email),
  },
};

if (apply) {
  report.applied = await applyPlan(env, plan);
}

console.log(JSON.stringify(report, null, 2));
