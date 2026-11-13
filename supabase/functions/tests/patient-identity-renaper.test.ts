import { handleRequest } from "../patient-identity-renaper/index.ts";

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("RENAPER Edge Function enforces the service-role boundary", async (t) => {
  const serviceRoleEnvName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
  const env: Record<string, string> = {
    [serviceRoleEnvName]: "synthetic-privileged-token",
    BUS_INTEROP_NON_FHIR_APPLICATION_NAME: "test-application",
    BUS_INTEROP_NON_FHIR_PASSWORD: "test-password",
    BUS_INTEROP_NON_FHIR_DOMAIN_CODE: "test-domain",
  };
  const getEnv = (name: string) => env[name];
  const neverFetch: typeof fetch = async () => {
    throw new Error("Upstream must not be contacted for rejected requests");
  };

  await t.step("rejects non-POST methods", async () => {
    const response = await handleRequest(
      new Request("https://edge.test", { method: "GET" }),
      { getEnv, fetcher: neverFetch },
    );
    assertEquals(response.status, 405, "method status");
  });

  await t.step("rejects missing service-role bearer", async () => {
    const response = await handleRequest(
      new Request("https://edge.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni: "12345678", sexId: 1 }),
      }),
      { getEnv, fetcher: neverFetch },
    );
    assertEquals(response.status, 401, "authorization status");
  });

  await t.step("rejects malformed identity before any upstream request", async () => {
    const response = await handleRequest(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-privileged-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dni: "not-a-dni", sexId: 1 }),
      }),
      { getEnv, fetcher: neverFetch },
    );
    assertEquals(response.status, 400, "validation status");
  });

  await t.step("normalizes provider data without forwarding service-role credentials", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push({ url, headers: new Headers(init?.headers) });

      if (url.endsWith("/usuarios/aplicacion/login")) {
        return new Response(JSON.stringify({ token: "bus-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/personas/renaper?")) {
        return new Response(JSON.stringify({
          nombres: "Ana",
          apellido: "Silva",
          numeroDocumento: "12345678",
          fechaNacimiento: "1990-01-02",
          sexo: "F",
          cuil: "20123456789",
          foto: "server-only-photo-payload",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/personas/cobertura?")) {
        return new Response(JSON.stringify([{
          rnos: "123",
          cobertura: "Cobertura de prueba",
          servicio: "Servicio de prueba",
          fechaConsulta: "2026-11-13",
        }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Unexpected upstream URL", { status: 500 });
    };

    const response = await handleRequest(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-privileged-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dni: "12345678", sexId: 1 }),
      }),
      { getEnv, fetcher: mockFetch },
    );
    const payload = await response.json();
    const personCall = calls[1];
    const coverageCall = calls[2];
    if (!personCall || !coverageCall) throw new Error("Expected all three upstream calls");

    assertEquals(response.status, 200, "lookup status");
    assertEquals(response.headers.get("Cache-Control"), "no-store, private", "PII cache policy");
    assertEquals(payload.success, true, "lookup success");
    assertEquals(payload.data.person.numeroDocumento, "12345678", "normalized DNI");
    assertEquals(payload.data.coverages.length, 1, "normalized coverage count");
    assertEquals(calls.length, 3, "upstream request count");
    assertEquals(personCall.headers.get("Authorization"), null, "service-role token must not reach RENAPER");
    assertEquals(coverageCall.headers.get("Authorization"), null, "service-role token must not reach coverage provider");
    assertEquals(personCall.headers.get("token"), "bus-access-token", "BUS access token header");
    assertEquals(JSON.stringify(payload).includes("synthetic-privileged-token"), false, "service-role token must not be returned");
  });
});
