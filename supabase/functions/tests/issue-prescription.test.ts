import { assertEquals } from "jsr:@std/assert";
import { handler } from "../issue-prescription/index.ts";

const DUMMY_ENV = () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
};

Deno.test("issue-prescription - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/issue-prescription", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
});

Deno.test("issue-prescription - Method Not Allowed", async () => {
  const req = new Request("http://localhost/issue-prescription", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.code, "METHOD_NOT_ALLOWED");
});

Deno.test("issue-prescription - Missing Authorization Header", async () => {
  DUMMY_ENV();
  const req = new Request("http://localhost/issue-prescription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId: "pat-123" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.code, "AUTH_REQUIRED");
});

Deno.test("issue-prescription - Doctor role check fails if role is not doctor", async () => {
  DUMMY_ENV();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-123" }), { status: 200 });
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({
          first_name: "Juan",
          last_name: "Pérez",
          role: "patient",
          active: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientId: "pat-123" }),
    });
    const res = await handler(req);
    assertEquals(res.status, 403);
    const data = await res.json();
    assertEquals(data.code, "FORBIDDEN_ROLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("issue-prescription - Argentina REFEPS required validation", async () => {
  DUMMY_ENV();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "doc-user-123" }), { status: 200 });
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({
          first_name: "Martín",
          last_name: "González",
          role: "doctor",
          active: true,
          sss_validation_status: "valid",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(
        JSON.stringify({
          id: "doc-rec-123",
          user_id: "doc-user-123",
          active: true,
          license_number: "MN 12345",
          refeps_id: null, // Missing REFEPS
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        countryCode: "AR",
        items: [{ name: "Ibuprofeno", dosage: "400mg", frequency: "8h" }],
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 422);
    const data = await res.json();
    assertEquals(data.code, "REFEPS_REQUIRED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("issue-prescription - Argentina SSS validation required", async () => {
  DUMMY_ENV();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "doc-user-123" }), { status: 200 });
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({
          first_name: "Martín",
          last_name: "González",
          role: "doctor",
          active: true,
          sss_validation_status: "pending_review", // Not valid or exempt
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(
        JSON.stringify({
          id: "doc-rec-123",
          user_id: "doc-user-123",
          active: true,
          license_number: "MN 12345",
          refeps_id: "REF-12345",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        countryCode: "AR",
        items: [{ name: "Ibuprofeno", dosage: "400mg", frequency: "8h" }],
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 422);
    const data = await res.json();
    assertEquals(data.code, "SSS_VALIDATION_REQUIRED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("issue-prescription - legacy AR and BR issuance never fabricate signed artifacts", async () => {
  DUMMY_ENV();
  const originalFetch = globalThis.fetch;
  const mutations: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "doctor-demo-user" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(JSON.stringify({
        role: "doctor", active: true, sss_validation_status: "valid",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(JSON.stringify({
        id: "doctor-demo", active: true, refeps_id: "REFEPS-DEMO",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes((init?.method || "GET").toUpperCase())) {
      mutations.push(url);
    }
    return originalFetch(input, init);
  };

  try {
    for (const countryCode of ["AR", "BR"]) {
      const req = new Request("http://localhost/issue-prescription", {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: "synthetic-patient",
          countryCode,
          items: [{ generic_name: "SYNTHETIC ONLY" }],
        }),
      });
      const res = await handler(req);
      assertEquals(res.status, 409);
      const body = await res.json();
      assertEquals(body.code, "OFFICIAL_ISSUANCE_PROVIDER_REQUIRED");
      assertEquals(body.success, false);
      assertEquals(body.data, undefined);
    }

    const unknownCountryReq = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientId: "synthetic-patient", items: [{ generic_name: "TEST" }] }),
    });
    const response = await handler(unknownCountryReq);
    assertEquals(response.status, 422);
    assertEquals((await response.json()).code, "COUNTRY_REQUIRED");
    assertEquals(mutations, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
