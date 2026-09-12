import { assertEquals, assertMatch } from "jsr:@std/assert";
import { handler } from "../issue-medical-order/index.ts";

const DUMMY_ENV = () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
};

Deno.test("issue-medical-order - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/issue-medical-order", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
});

Deno.test("issue-medical-order - Method Not Allowed", async () => {
  const req = new Request("http://localhost/issue-medical-order", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.code, "METHOD_NOT_ALLOWED");
});

Deno.test("issue-medical-order - Missing Authorization Header", async () => {
  DUMMY_ENV();
  const req = new Request("http://localhost/issue-medical-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId: "pat-123" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.code, "AUTH_REQUIRED");
});

Deno.test("issue-medical-order - Role validation rejects non-doctor", async () => {
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
          first_name: "Ana",
          last_name: "López",
          role: "patient",
          active: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-medical-order", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        studyType: "laboratory",
        practices: [{ name: "Hemograma" }],
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 403);
    const data = await res.json();
    assertEquals(data.code, "FORBIDDEN_ROLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("issue-medical-order - Invalid studyType returns 400", async () => {
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
          first_name: "Esteban",
          last_name: "Quito",
          role: "doctor",
          active: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(
        JSON.stringify({
          id: "doc-123",
          user_id: "doc-user-123",
          active: true,
          license_number: "MN 445566",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-medical-order", {
      method: "POST",
      headers: {
        Authorization: "Bearer doc-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        studyType: "invalid_type",
        practices: [{ name: "Hemograma" }],
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.code, "INVALID_STUDY_TYPE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("issue-medical-order - Empty practices returns 400", async () => {
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
          first_name: "Esteban",
          last_name: "Quito",
          role: "doctor",
          active: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(
        JSON.stringify({
          id: "doc-123",
          user_id: "doc-user-123",
          active: true,
          license_number: "MN 445566",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-medical-order", {
      method: "POST",
      headers: {
        Authorization: "Bearer doc-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        studyType: "imaging",
        practices: [],
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.code, "PRACTICES_REQUIRED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("issue-medical-order - Successful order issuance with O- CUIR, QR, PDF, and signed status", async () => {
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
          first_name: "Esteban",
          last_name: "Quito",
          role: "doctor",
          active: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/doctors")) {
      return new Response(
        JSON.stringify({
          id: "doc-123",
          user_id: "doc-user-123",
          active: true,
          license_number: "MN 445566",
          license_jurisdiction: "CABA",
          specialty: "Traumatología",
          refeps_id: "REF-778899",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({
          id: "pat-123",
          user_id: "pat-user-789",
          dni: "40112233",
          cuil: "20-40112233-1",
          insurance_info: { provider: "Galeno" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/profiles") && url.includes("pat-user")) {
      return new Response(
        JSON.stringify({
          first_name: "Federico",
          last_name: "Sosa",
          dni: "40112233",
          cuil: "20-40112233-1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/storage/v1/object/upload/sign/medical-documents") || url.includes("/storage/v1/object/medical-documents")) {
      return new Response(
        JSON.stringify({ Key: "medical-documents/medical-orders/order-generated-123.pdf" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/storage/v1/object/sign/medical-documents")) {
      return new Response(
        JSON.stringify({ signedURL: "/storage/v1/render/image/sign/order-test.pdf?token=dummy" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/medical_orders")) {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "order-generated-123", created_at: "2026-09-12T10:00:00Z" }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (init?.method === "PATCH") {
        const bodyObj = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            id: "order-generated-123",
            cuir: bodyObj.cuir,
            qr_code_content: bodyObj.qr_code_content,
            signed_pdf_url: bodyObj.signed_pdf_url,
            status: "signed",
            created_at: "2026-09-12T10:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/issue-medical-order", {
      method: "POST",
      headers: {
        Authorization: "Bearer doc-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: "pat-123",
        studyType: "imaging",
        practices: [
          { name: "Radiografía de rodilla frente y perfil" },
          { name: "Resonancia magnética de rodilla derecha" },
        ],
        diagnosis: "Gonalgia derecha post-traumática (M25.5)",
        notes: "Presentar estudios previos en caso de contar con ellos.",
      }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.data.status, "signed");
    assertMatch(body.data.cuir, /^O-[A-Z0-9]{8}$/);
    assertEquals(body.data.qr_code_content, `https://autamedica.com/orders/${body.data.cuir}`);
    assertEquals(typeof body.data.signed_pdf_url, "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
