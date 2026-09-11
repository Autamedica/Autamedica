import { assertEquals } from "@std/assert";
import { handler, CANONICAL_SECTIONS } from "../patients-anamnesis/index.ts";

Deno.test("patients-anamnesis - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/patients-anamnesis", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("patients-anamnesis - Missing Authorization Header", async () => {
  const req = new Request("http://localhost/patients-anamnesis", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Missing authorization header");
});

Deno.test("patients-anamnesis - Invalid section name on save_section", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123", email: "test@autamedica.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-123", user_id: "user-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({ first_name: "Eduardo", last_name: "Marques" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis?")) {
      return new Response(
        JSON.stringify({
          id: "anamnesis-123",
          patient_id: "patient-123",
          status: "in_progress",
          completion_percentage: 10,
          sections_status: {},
          locked: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-anamnesis", {
      method: "POST",
      headers: {
        Authorization: "Bearer dummy_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "save_section",
        section: "invalid_nonexistent_section",
        data: {},
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.error, "Invalid or missing section name");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("patients-anamnesis - GET returns full snapshot and preloaded profile", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123", email: "paciente@autamedica.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({
          id: "patient-123",
          user_id: "user-123",
          birth_date: "1985-05-15",
          gender: "male",
          dni: "35123456",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({
          first_name: "Juan",
          last_name: "Pérez",
          phone: "+5491155554444",
          email: "paciente@autamedica.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis?")) {
      return new Response(
        JSON.stringify({
          id: "anamnesis-123",
          patient_id: "patient-123",
          status: "in_progress",
          completion_percentage: 23,
          sections_status: { edad: "completed", ocupacion: "completed" },
          locked: false,
          created_at: "2026-09-01T10:00:00Z",
          updated_at: "2026-09-11T12:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis_sections")) {
      const mockSections = CANONICAL_SECTIONS.map((sec, idx) => ({
        id: `sec-${idx}`,
        anamnesis_id: "anamnesis-123",
        section: sec,
        data: sec === "edad" ? { edad: "41" } : {},
        completed: idx < 2,
        updated_at: "2026-09-11T12:00:00Z",
      }));
      return new Response(
        JSON.stringify(mockSections),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-anamnesis", {
      method: "GET",
      headers: {
        Authorization: "Bearer dummy_token",
      },
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();

    assertEquals(data.anamnesis.id, "anamnesis-123");
    assertEquals(data.anamnesis.totalSections, 13);
    assertEquals(data.anamnesis.completedSectionsCount, 2);
    assertEquals(data.preload.firstName, "Juan");
    assertEquals(data.preload.birthDate, "1985-05-15");
    assertEquals(data.sections.length, 13);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("patients-anamnesis - save_section updates progress successfully", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123", email: "paciente@autamedica.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-123", user_id: "user-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({ first_name: "Juan", last_name: "Pérez" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis?")) {
      return new Response(
        JSON.stringify({
          id: "anamnesis-123",
          patient_id: "patient-123",
          status: "in_progress",
          completion_percentage: 0,
          sections_status: {},
          locked: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis_sections") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "sec-motivo",
          anamnesis_id: "anamnesis-123",
          section: "motivo_consulta",
          data: { motivo: "Dolor de cabeza recurrente" },
          completed: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis_sections?")) {
      return new Response(
        JSON.stringify([
          { section: "motivo_consulta", completed: true },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis?") && init?.method === "PATCH") {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-anamnesis", {
      method: "POST",
      headers: {
        Authorization: "Bearer dummy_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "save_section",
        section: "motivo_consulta",
        data: { motivo: "Dolor de cabeza recurrente" },
        completed: true,
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.success, true);
    assertEquals(data.completedSectionsCount, 1);
    assertEquals(data.totalSections, 13);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("patients-anamnesis - submit locks anamnesis and creates version", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  let versionInserted = false;
  let anamnesisLocked = false;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // fetch handler

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123", email: "paciente@autamedica.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-123", user_id: "user-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(
        JSON.stringify({ first_name: "Juan", last_name: "Pérez" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis_sections?")) {
      return new Response(
        JSON.stringify(CANONICAL_SECTIONS.map(s => ({ section: s, completed: true }))),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis_versions")) {
      if (init?.method?.toUpperCase() === "POST") {
        versionInserted = true;
        return new Response(JSON.stringify([{ id: "ver-1" }]), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/anamnesis?") && (init?.method === "PATCH" || init?.method === "patch")) {
      anamnesisLocked = true;
      return new Response(
        JSON.stringify({
          id: "anamnesis-123",
          status: "under_review",
          locked: true,
          completion_percentage: 100,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/anamnesis?")) {
      return new Response(
        JSON.stringify({
          id: "anamnesis-123",
          patient_id: "patient-123",
          status: "in_progress",
          completion_percentage: 100,
          sections_status: {},
          locked: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-anamnesis", {
      method: "POST",
      headers: {
        Authorization: "Bearer dummy_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "submit",
      }),
    });
    const res = await handler(req);
    const data = await res.json();
    if (res.status !== 200) {
      console.log("SUBMIT FAILED:", res.status, data);
    }
    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.versionNumber, 1);
    assertEquals(versionInserted, true);
    assertEquals(anamnesisLocked, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

