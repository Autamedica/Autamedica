import { XMLParser } from "fast-xml-parser";
import { readFile, writeFile } from "node:fs/promises";

const envText = await readFile("/home/edu/autamedica-newsletter-worker/.dev.vars", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

env.FROM_EMAIL ??= "contacto@autamedica.com";
env.FROM_NAME ??= "AutaMedica";
env.SUBJECT_PREFIX ??= "Salud Digital";
env.RSS_FEEDS ??= "https://rss.nytimes.com/services/xml/rss/nyt/Well.xml,https://www.theguardian.com/lifeandstyle/wellbeing/rss,https://www.sciencedaily.com/rss/health_medicine.xml,https://www.health.harvard.edu/blog/feed,https://neurosciencenews.com/feed/";
env.TIMEZONE_LABEL ??= "Argentina";
env.HEADER_IMAGE_URL ??= "https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif";

const MAX_ITEMS_PER_FEED = 6;
const MAX_ITEMS_TO_SUMMARIZE = 2;
const MAX_CANDIDATES = 10;
const AI_MODEL = "gemini-2.5-flash";
const MAX_ARTICLE_CHARS = 4000;

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeItem(it, source) {
  const link = typeof it.link === "string" ? it.link : it.link?.["@_href"] ?? "";
  return {
    title: stripTags(String(it.title ?? "")),
    link,
    description: stripTags(String(it.description ?? it.summary ?? "")).slice(0, 600),
    pubDate: String(it.pubDate ?? it.published ?? it.updated ?? ""),
    source,
  };
}

async function fetchAllFeeds(feeds) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const results = await Promise.allSettled(
    feeds.map(async (url) => {
      const res = await fetch(url, { headers: { "user-agent": "AutaMedicaNewsletterBot/1.0" } });
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      const xml = await res.text();
      const parsed = parser.parse(xml);
      const channel = parsed?.rss?.channel ?? parsed?.feed;
      const sourceTitle = channel?.title ?? new URL(url).hostname;
      const rawItems = channel?.item ?? channel?.entry ?? [];
      const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
      return arr.slice(0, MAX_ITEMS_PER_FEED).map((it) => normalizeItem(it, sourceTitle));
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

function rankRecent(items) {
  return items
    .map((i) => ({ i, t: Date.parse(i.pubDate) || 0 }))
    .sort((a, b) => b.t - a.t)
    .map((x) => x.i);
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    console.error("gemini_error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    return JSON.parse(text);
  } catch {
    const match = text?.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

async function summarizeItem(item) {
  const prompt = `Sos editor de una newsletter diaria llamada AutaMedica, enfocada en Ciencia Aplicada a la Vida Cotidiana. Audiencia: publico general en Latinoamerica interesado en salud y bienestar. Cada edicion destaca hallazgos cientificos que conectan con cosas que la gente YA hace sin darse cuenta.

Primero, evalua si esta noticia califica. Debe cumplir LAS 3 REGLAS:
1. Buena noticia: positiva, esperanzadora, accionable. RECHAZAR: pandemias, muertes, colapso sanitario, enfermedades terminales, crisis.
2. Ciencia real: basada en estudio, paper, ensayo clinico o investigacion verificable.
3. Conexion cotidiana: el hallazgo se traduce en una accion o habito que el lector YA hace o puede incorporar sin esfuerzo.

Si NO cumple las 3, devolve exactamente: {"skip": true}

Si SI cumple, devolve JSON con body de 5 a 7 oraciones con esta estructura:
1. Lead: el hallazgo concreto con dato duro.
2. La actividad cotidiana conectada.
3. Por que funciona: mecanismo biologico preciso.
4. La instruccion para hoy: detalle concreto.
5. Cierre con textura: cita o dato curioso.

Titulo original: ${item.title}
Fuente: ${item.source}
Contenido: ${item.description.slice(0, MAX_ARTICLE_CHARS)}

Devolve SOLO JSON valido, sin markdown:
{"headline": "titulo corto y potente", "body": "5-7 oraciones"}
o bien:
{"skip": true}`;
  const parsed = await callGemini(prompt);
  if (!parsed || parsed.skip === true) return null;
  if (!parsed.headline || !parsed.body) return null;
  return { headline: parsed.headline, body: parsed.body, link: item.link, source: item.source, originalTitle: item.title };
}

function formatDateAR() {
  return new Date().toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function renderHtml(summaries) {
  const date = formatDateAR();
  const articleHtml = summaries.map((s, idx) => `
                <article style="margin:0 0 32px 0;padding:0 0 28px 0;${idx === summaries.length - 1 ? "" : "border-bottom:1px solid #F1F5F9;"}">
                    <h2 style="font-family:'Georgia', serif;font-size:24px;line-height:1.24;font-weight:700;color:#000000;margin:0 0 14px 0;">
                        <a href="${escapeAttr(s.link)}" style="color:#000000;text-decoration:none;">${escapeHtml(s.headline)}</a>
                    </h2>
                    <p style="font-size:16px;line-height:1.65;margin:0 0 16px 0;color:#475569;">${escapeHtml(s.body)}</p>
                    <p style="font-size:11px;line-height:1.4;margin:0;color:#64748B;text-transform:uppercase;font-weight:700;">${escapeHtml(s.source)}</p>
                </article>`).join("");

  const emptyState = `
                <div class="suggestion-box">
                    <p style="margin:0;"><strong>Edición en revisión:</strong><br>
                    Hoy el filtro editorial dejó las noticias en espera. Priorizamos publicar solo hallazgos útiles, verificables y conectados con hábitos cotidianos.</p>
                </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Newsletter AutaMedica</title>
    <style>
        body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #000000; }
        .email-container { max-width: 600px; margin: 40px auto; background-color: #FFFFFF; border-radius: 32px; overflow: hidden; border: 1px solid #EEEEEE; box-shadow: 0 20px 40px rgba(0,0,0,0.05); }
        .header-bg { border-bottom: 1px solid #F1F5F9; }
        .content { padding: 48px; line-height: 1.6; }
        h1 { font-family: 'Georgia', serif; font-size: 32px; line-height: 1.16; font-weight: 700; color: #000000; margin: 0 0 24px 0; }
        p { font-size: 16px; margin-bottom: 20px; color: #475569; }
        .eyebrow { font-size: 11px; color: #00A3FF; margin: 0 0 12px 0; text-transform: uppercase; font-weight: 800; }
        .suggestion-box { background-color: #F8FAFC; padding: 24px; border-radius: 20px; margin-top: 32px; border-left: 4px solid #00A3FF; }
        .footer { padding: 40px; text-align: center; font-size: 14px; color: #64748B; border-top: 1px solid #F1F5F9; }
        .legal-badge { color: #00A3FF; font-weight: 700; display: block; margin-bottom: 8px; }
        @media only screen and (max-width: 640px) {
            .email-container { margin: 0; border-radius: 0; border-left: 0; border-right: 0; }
            .content { padding: 32px 24px; }
            .footer { padding: 32px 24px; }
            h1 { font-size: 28px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="header-bg">
            <tr>
                <td background="${escapeAttr(env.HEADER_IMAGE_URL)}" bgcolor="#ffffff" width="600" height="125" valign="top" style="background-image:url('${escapeAttr(env.HEADER_IMAGE_URL)}');background-repeat:no-repeat;background-size:contain;background-position:left center;">
                    <div style="height:125px;width:100%;line-height:125px;font-size:0;">&nbsp;</div>
                </td>
            </tr>
        </table>

        <div class="content">
            <p class="eyebrow">Salud Digital · ${escapeHtml(date)}</p>
            <h1>La ciencia aplicada a lo que ya hacemos</h1>
            ${articleHtml || emptyState}
        </div>

        <div class="footer">
            <span class="legal-badge">AutaMedica</span>
            <p style="font-size:12px;margin:0 0 18px 0;">Tecnología que late con usted.</p>
            <div style="margin-top:24px;">
                <a href="https://www.autamedica.com" style="color:#64748B;font-size:12px;text-decoration:none;">www.autamedica.com</a>
                <span style="color:#CBD5E1;margin:0 8px;">·</span>
                <span style="color:#64748B;font-size:12px;">contacto@autamedica.com</span>
            </div>
            <div style="margin-top:18px;">
                <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#64748B;font-size:12px;">Darse de baja</a>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

const feeds = env.RSS_FEEDS.split(",").map((s) => s.trim()).filter(Boolean);
const items = await fetchAllFeeds(feeds);
const candidates = rankRecent(items).slice(0, MAX_CANDIDATES);
const evaluated = await Promise.all(candidates.map(summarizeItem));
const accepted = evaluated.filter(Boolean).slice(0, MAX_ITEMS_TO_SUMMARIZE);

await writeFile("/tmp/autamedica-newsletter-today.html", renderHtml(accepted), "utf8");
await writeFile("/tmp/autamedica-newsletter-today.json", JSON.stringify({ candidates, accepted }, null, 2), "utf8");
console.log(JSON.stringify({ accepted }, null, 2));
