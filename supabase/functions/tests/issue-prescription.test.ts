import { assertEquals } from "jsr:@std/assert";

Deno.test("issue-prescription - Brazilian CPF validation never calls the Argentine SISA verifier", async () => {
  DUMMY_ENV();
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requestedUrls.push(url);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "br-doctor-user" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(JSON.stringify({
        role: "doctor", active: true, sss_validation_status: "pending_review",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(JSON.stringify({
        id: "br-doctor", user_id: "br-doctor-user", active: true,
        license_type: "CRM", license_number: "123456", uf_brazil: "RS",
        care_country: "BR", cpf: "11111111111",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const req = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "123e4567-e89b-42d3-a456-426614174000",
        countryCode: "BR",
        diagnosis: "Synthetic test",
        items: [{ generic_name: "Synthetic test" }],
        clinicalData: {
          diagnosis: "Synthetic test",
          items: [{ generic_name: "Synthetic test" }],
        },
      }),
    });
    const response = await handler(req);
    assertEquals(response.status, 422);
    assertEquals((await response.json()).code, "BR_DOCTOR_CPF_REQUIRED");
    assertEquals(requestedUrls.some((url) => url.includes("verify-doctor-license")), false);
    assertEquals(requestedUrls.some((url) => url.includes("/rest/v1/prescriptions")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
      body: JSON.stringify({ patientId: "pat-123", countryCode: "AR" }),
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
          license_number: "12345",
          license_type: "MN",
          care_country: "AR",
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
          license_number: "12345",
          license_type: "MN",
          care_country: "AR",
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
      assertEquals(res.status, 422);
      const body = await res.json();
      assertEquals(body.code, countryCode === "AR" ? "ARGENTINE_LICENSE_REQUIRED" : "CRM_UF_REQUIRED");
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

Deno.test("issue-prescription - forwards nested Astro jsonFail error code and details cleanly", async () => {
  DUMMY_ENV();
  Deno.env.set("AUTAMEDICA_WEB_URL", "https://web.example.com");
  const originalFetch = globalThis.fetch;
  let draftDeleted = false;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "ar-doctor-user" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(JSON.stringify({
        role: "doctor",
        active: true,
        sss_validation_status: "valid",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(JSON.stringify({
        id: "ar-doctor",
        user_id: "ar-doctor-user",
        active: true,
        license_type: "MN",
        license_number: "123456",
        care_country: "AR",
        refeps_id: "REFEPS-123",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(JSON.stringify({
        id: "123e4567-e89b-42d3-a456-426614174000",
        user_id: "pat-user",
        care_country: "AR",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/doctor_patient")) {
      return new Response(JSON.stringify({ patient_id: "123e4567-e89b-42d3-a456-426614174000" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (
      url.includes("/rest/v1/patient_care_team") ||
      url.includes("/rest/v1/appointments") ||
      url.includes("/rest/v1/pharmacy_dispatch_requests")
    ) {
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/prescriptions") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "draft-rx-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/prescriptions") && init?.method === "DELETE") {
      draftDeleted = true;
      return new Response(null, { status: 204 });
    }
    if (url === "https://web.example.com/api/doctors/prescriptions/draft-rx-1/issue") {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "VALIDATION",
          message: "farmalink_mapping_failed",
          details: "prescriber.documentNumber",
        },
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "123e4567-e89b-42d3-a456-426614174000",
        countryCode: "AR",
        diagnosis: "Hipertensión esencial",
        items: [{ generic_name: "Enalapril 10 mg" }],
        clinicalData: {
          diagnosis: "Hipertensión esencial",
          items: [{ generic_name: "Enalapril 10 mg" }],
        },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.code, "farmalink_mapping_failed");
    assertEquals(body.details, "prescriber.documentNumber");
    assertEquals(body.prescriptionId, "draft-rx-1");
    assertEquals(draftDeleted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
