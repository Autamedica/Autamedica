import { assertEquals } from "jsr:@std/assert";
import { handler } from "../cloudflare-calls/index.ts";

function setEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role"); // secrets.test
  Deno.env.set("CLOUDFLARE_CALLS_APP_ID", "cf-app-1");
  Deno.env.set("CLOUDFLARE_CALLS_APP_SECRET", "cf-secret");
}

type FetchMock = (_input: RequestInfo | URL, _init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockSupabaseFetch(overrides: {
  user: { id: string };
  call?: Record<string, unknown> | null;
  doctor?: Record<string, unknown> | null;
  patient?: Record<string, unknown> | null;
  dispatch?: Record<string, unknown> | null;
  cfResponse?: { status: number; body: unknown };
}): FetchMock {
  const originalFetch = globalThis.fetch;
  const mock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return jsonResponse(overrides.user);
    }

    if (url.includes("/rest/v1/calls?")) {
      if (overrides.call === undefined) {
        return jsonResponse([]);
      }
      return jsonResponse(overrides.call === null ? [] : [overrides.call]);
    }

    if (url.includes("/rest/v1/doctors?")) {
      return jsonResponse(overrides.doctor === null ? [] : [overrides.doctor]);
    }

    if (url.includes("/rest/v1/patients?")) {
      return jsonResponse(overrides.patient === null ? [] : [overrides.patient]);
    }

    if (url.includes("/rest/v1/pharmacy_dispatch_requests?")) {
      return jsonResponse(overrides.dispatch === null ? [] : [overrides.dispatch]);
    }

    if (url.includes("rtc.live.cloudflare.com")) {
      const cf = overrides.cfResponse ?? { status: 200, body: { ok: true } };
      return jsonResponse(cf.body, cf.status);
    }

    return originalFetch(input, init);
  };
  return mock;
}

Deno.test("cloudflare-calls - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/cloudflare-calls", { method: "OPTIONS" });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("cloudflare-calls - Method Not Allowed", async () => {
  const req = new Request("http://localhost/cloudflare-calls", { method: "GET" });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.error, "Method not allowed");
});

Deno.test("cloudflare-calls - Missing Authorization Header", async () => {
  setEnv();
  const req = new Request("http://localhost/cloudflare-calls", {
    method: "POST",
    body: JSON.stringify({ roomId: "room-1", path: "sessions/new", body: {} }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Missing authorization header");
});

Deno.test("cloudflare-calls - Missing roomId", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-123" },
    call: null,
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({ path: "sessions/new" }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.error, "Missing required field: roomId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Forbidden path", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-123" },
    call: null,
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "room-1",
        path: "../../../admin/config",
        body: {},
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Room not found is forbidden", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-123" },
    call: null,
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "unknown-room",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Terminal call is rejected", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-123" },
    call: {
      id: "call-1",
      room_id: "room-1",
      doctor_id: "dr-1",
      patient_id: "pat-1",
      status: "ended",
    },
    doctor: { id: "dr-1", user_id: "user-123" },
    patient: { id: "pat-1", user_id: "user-123" },
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "room-1",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Non-participant user is forbidden", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-456" },
    call: {
      id: "call-1",
      room_id: "room-1",
      doctor_id: "dr-1",
      patient_id: "pat-1",
      status: "ringing",
    },
    doctor: { id: "dr-1", user_id: "user-123" },
    patient: { id: "pat-1", user_id: "user-123" },
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "room-1",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Doctor participant proxies to SFU", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-123" },
    call: {
      id: "call-1",
      room_id: "room-1",
      doctor_id: "dr-1",
      patient_id: "pat-1",
      status: "ringing",
    },
    doctor: { id: "dr-1", user_id: "user-123" },
    patient: { id: "pat-1", user_id: "user-123" },
    cfResponse: {
      status: 201,
      body: {
        sessionId: "sdjkh24jh",
        sessionDescription: { type: "answer", sdp: "fake-sdp" },
      },
    },
  });
  let cfRequest = "";
  const proxying = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    cfRequest = url;
    if (url.includes("rtc.live.cloudflare.com")) {
      let auth: string | undefined;
      if (init?.headers instanceof Headers) {
        auth = init.headers.get("Authorization") ?? undefined;
      } else if (init?.headers) {
        const headers = init.headers as Record<string, string>;
        auth = headers["Authorization"] ?? headers["authorization"];
      }
      assertEquals(auth, "Bearer cf-secret");
    }
    return mockSupabaseFetch({
      user: { id: "user-123" },
      call: {
        id: "call-1",
        room_id: "room-1",
        doctor_id: "dr-1",
        patient_id: "pat-1",
        status: "ringing",
      },
      doctor: { id: "dr-1", user_id: "user-123" },
      patient: { id: "pat-1", user_id: "user-123" },
      cfResponse: {
        status: 201,
        body: {
          sessionId: "sdjkh24jh",
          sessionDescription: { type: "answer", sdp: "fake-sdp" },
        },
      },
    })(input, init);
  };
  globalThis.fetch = proxying;
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "room-1",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.sessionId, "sdjkh24jh");
    const url = cfRequest;
    assertEquals(url, "https://rtc.live.cloudflare.com/v1/apps/cf-app-1/sessions/new");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Direct user_id in doctor_id or patient_id authorizes successfully", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-direct-doc" },
    call: {
      id: "call-uuid-1",
      room_id: "room-slug-1",
      doctor_id: "user-direct-doc",
      patient_id: "patient-subrogate-id",
      status: "in_progress",
    },
    cfResponse: {
      status: 201,
      body: { sessionId: "sess-direct-doc", sessionDescription: { type: "answer", sdp: "dummy" } },
    },
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "room-slug-1",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.sessionId, "sess-direct-doc");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Dispatch patient authorizes via materialized patients.id", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-patient" },
    call: null,
    dispatch: {
      id: "disp-1",
      cloudflare_room_id: "cf-room-general-1234-abc",
      assigned_doctor_id: "dr-1",
      status: "in_call",
      patient_id: "pat-dispatch-1",
      requested_by_user_id: "user-patient",
      patient_dni: "12345678",
    },
    doctor: null,
    patient: { id: "pat-dispatch-1", user_id: "user-patient" },
    cfResponse: {
      status: 201,
      body: { sessionId: "sess-dispatch-patient", sessionDescription: { type: "answer", sdp: "dummy" } },
    },
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "cf-room-general-1234-abc",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.sessionId, "sess-dispatch-patient");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - Dispatch legacy fallback keeps requested_by_user_id authorization", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-patient" },
    call: null,
    dispatch: {
      id: "disp-legacy",
      cloudflare_room_id: "cf-room-general-0000-xyz",
      assigned_doctor_id: "dr-legacy",
      status: "in_call",
      patient_id: null,
      requested_by_user_id: "user-patient",
      patient_dni: "45678901",
    },
    doctor: null,
    patient: null,
    cfResponse: {
      status: 201,
      body: { sessionId: "sess-dispatch-legacy", sessionDescription: { type: "answer", sdp: "dummy" } },
    },
  });
  try {
    const req = new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        roomId: "cf-room-general-0000-xyz",
        method: "POST",
        path: "sessions/new",
        body: { sessionDescription: { type: "offer", sdp: "dummy" } },
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.sessionId, "sess-dispatch-legacy");
  } finally {
    globalThis.fetch = originalFetch;
  }
});