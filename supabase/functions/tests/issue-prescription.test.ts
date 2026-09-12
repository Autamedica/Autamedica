import { assertEquals, assertMatch } from "jsr:@std/assert";
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

Deno.test("issue-prescription - Successful issuance with CUIR, QR, PDF, and sent status", async () => {
  DUMMY_ENV();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "doc-user-123" }), { status: 200 });
    }
    if (url.includes("/rest/v1/profiles") && !url.includes("pat-user")) {
      return new Response(
        JSON.stringify({
          first_name: "Luciana",
          last_name: "Valenzuela",
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
          license_number: "MN 991122",
          license_jurisdiction: "CABA",
          refeps_id: "REF-889900",
          specialty: "Infectología",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({
          id: "pat-123",
          user_id: "pat-user-456",
          dni: "34567890",
          cuil: "20-34567890-9",
          address: "Av. Libertador 2200",
          insurance_info: { provider: "Medifé" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/profiles") && url.includes("pat-user")) {
      return new Response(
        JSON.stringify({
          first_name: "Carlos",
          last_name: "García",
          dni: "34567890",
          cuil: "20-34567890-9",
          address: "Av. Libertador 2200",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/storage/v1/object/upload/sign/medical-documents") || url.includes("/storage/v1/object/medical-documents")) {
      return new Response(
        JSON.stringify({ Key: "medical-documents/prescriptions/test.pdf" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/storage/v1/object/sign/medical-documents")) {
      return new Response(
        JSON.stringify({ signedURL: "/storage/v1/render/image/sign/test.pdf?token=dummy" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/prescriptions")) {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "rx-generated-123", created_at: "2026-09-12T10:00:00Z" }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (init?.method === "PATCH") {
        const bodyObj = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            id: "rx-generated-123",
            cuir: bodyObj.cuir,
            qr_code_content: bodyObj.qr_code_content,
            signed_pdf_url: bodyObj.signed_pdf_url,
            status: "sent",
            created_at: "2026-09-12T10:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    if (url.includes("/rest/v1/prescription_audit_events") || url.includes("/rest/v1/dispensation_orders")) {
      return new Response(JSON.stringify({ id: "audit-123" }), { status: 201 });
    }

    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-prescription", {
      method: "POST",
      headers: {
        Authorization: "Bearer doc-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        countryCode: "AR",
        items: [
          {
            name: "Amoxicilina 500mg",
            generic_name: "Amoxicilina",
            dosage: "500mg",
            frequency: "Cada 8h",
            duration: "7 días",
          },
        ],
        diagnosis: "Faringitis aguda",
      }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.data.status, "sent");
    assertMatch(body.data.cuir, /^AR-MD-[0-9A-F]+-[0-9A-F]+$/);
    assertEquals(body.data.qr_code_content, `https://autamedica.com/verify/${body.data.cuir}`);
    assertEquals(typeof body.data.signed_pdf_url, "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
