#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

const DEFAULT_INPUT = "/home/edu/autamedica-brevo-events-2026-04-01_2026-04-21.json";
const BATCH_SIZE = 200;

loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "apps/web/.env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "apps/web/.env.local"), quiet: true });

function parseArgs(argv) {
  const args = {
    apply: false,
    input: DEFAULT_INPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--input") {
      args.input = argv[index + 1] ?? args.input;
      index += 1;
    } else if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Importa eventos historicos de Brevo a public.email_events_log.

Uso:
  node scripts/import-brevo-history-to-email-events-log.mjs --input /path/events.json
  node scripts/import-brevo-history-to-email-events-log.mjs --apply

Por defecto corre en dry-run. Requiere PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.`);
}

function normalizeEventType(eventType) {
  const normalized = String(eventType || "unknown").trim();
  const map = {
    clicks: "click",
    click: "click",
    opened: "opened",
    openings: "opened",
    delivered: "delivered",
    requests: "requests",
    request: "requests",
    hardBounces: "hard_bounce",
    hard_bounce: "hard_bounce",
    softBounces: "soft_bounce",
    soft_bounce: "soft_bounce",
    blocked: "blocked",
    spam: "spam",
    unsubscribed: "unsubscribed",
  };

  return map[normalized] ?? normalized;
}

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function eventKey(row) {
  const createdAt = new Date(row.created_at).getTime();
  return [
    row.email.toLowerCase(),
    row.event_type,
    row.provider_message_id ?? "",
    Number.isNaN(createdAt) ? row.created_at : String(createdAt),
  ].join("|");
}

function toEmailEventLogRows(events) {
  return events
    .filter((event) => typeof event?.email === "string" && event.email.includes("@"))
    .map((event) => {
      const providerMessageId = event.messageId ?? event["message-id"] ?? null;
      const eventType = normalizeEventType(event.event);
      const createdAt = normalizeDate(event.date ?? event.ts ?? event.created_at);

      return {
        email: event.email.trim().toLowerCase(),
        event_type: eventType,
        provider: "brevo",
        provider_message_id: providerMessageId,
        subject: event.subject ?? null,
        metadata: {
          ...event,
          imported_from: "brevo_history",
          original_event_type: event.event ?? null,
        },
        created_at: createdAt,
      };
    });
}

async function readBrevoEvents(inputPath) {
  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw);
  const events = Array.isArray(parsed) ? parsed : parsed.events;

  if (!Array.isArray(events)) {
    throw new Error("El archivo no contiene un array ni una propiedad events[]");
  }

  return events;
}

async function fetchExistingKeys(supabase, rows) {
  if (rows.length === 0) return new Set();

  const sortedDates = rows.map((row) => row.created_at).sort();
  const from = sortedDates[0];
  const to = sortedDates[sortedDates.length - 1];
  const keys = new Set();
  let fromIndex = 0;

  while (true) {
    const toIndex = fromIndex + 999;
    const { data, error } = await supabase
      .from("email_events_log")
      .select("email,event_type,provider_message_id,created_at")
      .eq("provider", "brevo")
      .gte("created_at", from)
      .lte("created_at", to)
      .range(fromIndex, toIndex);

    if (error) throw new Error(`No se pudieron leer eventos existentes: ${error.message}`);
    for (const row of data ?? []) keys.add(eventKey(row));
    if (!data || data.length < 1000) break;
    fromIndex += 1000;
  }

  return keys;
}

async function insertRows(supabase, rows) {
  let inserted = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from("email_events_log").insert(batch);
    if (error) throw new Error(`Falló insert batch ${index / BATCH_SIZE + 1}: ${error.message}`);
    inserted += batch.length;
  }

  return inserted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan PUBLIC_SUPABASE_URL/SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  const events = await readBrevoEvents(args.input);
  const rows = toEmailEventLogRows(events);
  const uniqueRows = Array.from(new Map(rows.map((row) => [eventKey(row), row])).values());
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const existingKeys = await fetchExistingKeys(supabase, uniqueRows);
  const newRows = uniqueRows.filter((row) => !existingKeys.has(eventKey(row)));
  const eventCounts = newRows.reduce((counts, row) => {
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    input: args.input,
    source_events: events.length,
    normalized_rows: rows.length,
    unique_rows: uniqueRows.length,
    existing_rows: uniqueRows.length - newRows.length,
    pending_insert: newRows.length,
    event_counts: eventCounts,
    mode: args.apply ? "apply" : "dry-run",
  }, null, 2));

  if (!args.apply) {
    console.log("Dry-run: agregá --apply para insertar en Supabase.");
    return;
  }

  const inserted = await insertRows(supabase, newRows);
  console.log(JSON.stringify({ inserted }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
