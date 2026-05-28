/**
 * AutaMedica - Turborepo Remote Cache Cloudflare Worker
 *
 * Implementa la especificación de API HTTP de Turborepo para Remote Caching,
 * utilizando Cloudflare R2 como backend de almacenamiento de alta velocidad, costo de egreso $0.
 */

export interface Env {
  R2_BUCKET: R2Bucket;
  AUTH_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Validar Autorización (Seguridad a Nivel Senior)
    const authHeader = request.headers.get("Authorization");
    const expectedToken = env.AUTH_TOKEN;

    if (!expectedToken) {
      return new Response(
        JSON.stringify({ error: "Worker de caché mal configurado. AUTH_TOKEN no configurado en Cloudflare." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(
        JSON.stringify({ error: "No autorizado. Token de caché inválido o ausente." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Enrutamiento de la API de Turborepo
    try {
      // Ruta: POST /v8/artifacts/events (Telemetría de eventos de Turborepo)
      if (path === "/v8/artifacts/events" && request.method === "POST") {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Validar formato de ruta: /v8/artifacts/:id
      const artifactMatch = path.match(/^\/v8\/artifacts\/([A-Za-z0-9_-]+)$/);
      if (!artifactMatch) {
        return new Response(JSON.stringify({ error: "Ruta no encontrada" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      const artifactId = artifactMatch[1];

      // Operación: HEAD (Verificar existencia de artefacto de caché)
      if (request.method === "HEAD") {
        const object = await env.R2_BUCKET.head(artifactId);
        if (object === null) {
          return new Response("No encontrado", { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Length", object.size.toString());
        headers.set("ETag", object.httpEtag);
        return new Response(null, { headers });
      }

      // Operación: GET (Descargar artefacto de caché)
      if (request.method === "GET") {
        const object = await env.R2_BUCKET.get(artifactId);
        if (object === null) {
          return new Response(
            JSON.stringify({ error: `Artefacto ${artifactId} no encontrado en R2` }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("Content-Type", "application/octet-stream");

        return new Response(object.body, { headers });
      }

      // Operación: PUT (Guardar/Subir nuevo artefacto de caché)
      if (request.method === "PUT") {
        if (!request.body) {
          return new Response(JSON.stringify({ error: "Cuerpo de petición vacío" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Subir de forma directa el stream de bytes al bucket R2
        await env.R2_BUCKET.put(artifactId, request.body, {
          httpMetadata: {
            contentType: "application/octet-stream"
          }
        });

        return new Response(JSON.stringify({ status: "success", id: artifactId }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Método HTTP no soportado para este recurso
      return new Response(JSON.stringify({ error: "Método no admitido" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      const error = err as Error;
      console.error("Error procesando petición de caché:", error);
      return new Response(
        JSON.stringify({ error: "Error interno del servidor", details: error?.message || String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
};
