const FILES = new Set([
  "autamedica-generica-4.pdf",
  "autamedica-marca.pdf",
]);

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const objectPath = url.searchParams.get("f") || "";
    const expires = Number(url.searchParams.get("e"));
    const signature = url.searchParams.get("s") || "";
    const match = objectPath.match(/^farmalink-homologation\/[0-9]+\/([^/]+)$/);
    const filename = match?.[1];

    if (!match || !FILES.has(filename) || !Number.isSafeInteger(expires)) {
      return new Response("Not found", { status: 404 });
    }
    if (Date.now() >= expires * 1000) {
      return new Response("Link expired", { status: 410 });
    }
    if (!env.DOWNLOAD_HMAC_SECRET) {
      return new Response("Service unavailable", { status: 503 });
    }

    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.DOWNLOAD_HMAC_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      const payload = new TextEncoder().encode(objectPath + "\\n" + String(expires));
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        decodeBase64Url(signature),
        payload
      );
      if (!valid) return new Response("Invalid link", { status: 403 });

      const object = await env.DOCS.get(objectPath);
      if (!object) return new Response("File not found", { status: 404 });

      return new Response(object.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="' + filename + '"',
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": String(object.size),
        },
      });
    } catch {
      return new Response("Unable to validate download", { status: 500 });
    }
  },
};
