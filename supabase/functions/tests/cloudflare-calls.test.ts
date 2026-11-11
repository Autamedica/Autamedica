import { assertEquals } from "jsr:@std/assert";
import { handler } from "../cloudflare-calls/index.ts";

function setEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role"); // secrets.test
  Deno.env.set("CLOUDFLARE_CALLS_APP_ID", "cf-app-1");
  Deno.env.set("CLOUDFLARE_CALLS_APP_SECRET", "cf-secret");
  Deno.env.set("GUEST_TOKEN_SECRET", "autamedica-jordan-test-secret");
  Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "false");
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
  partner?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  cfResponse?: { status: number; body: unknown };
  sfuBindings?: Array<{ session_id: string; room_id: string; principal_key: string }>;
  bindingWrites?: Array<Record<string, unknown>>;
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
      return jsonResponse(overrides.dispatch == null ? [] : [overrides.dispatch]);
    }

    if (url.includes("/rest/v1/commercial_referral_partners?")) {
      return jsonResponse(overrides.partner == null ? [] : [overrides.partner]);
    }

    if (url.includes("/rest/v1/pharmacy_dispatch_payments?")) {
      return jsonResponse(overrides.payment == null ? [] : [overrides.payment]);
    }

    if (url.includes("/rest/v1/sfu_room_session_bindings")) {
      if ((init?.method ?? "GET").toUpperCase() === "POST") {
        const value = JSON.parse(String(init?.body ?? "{}"));
        const rows = Array.isArray(value) ? value : [value];
        overrides.bindingWrites?.push(...rows);
        return new Response(null, { status: 201 });
      }
      const sessionFilter = new URL(url).searchParams.get("session_id");
      const rows = (overrides.sfuBindings ?? []).filter((row) =>
        !sessionFilter || !sessionFilter.startsWith("eq.") || row.session_id === sessionFilter.slice(3)
      );
      return jsonResponse(rows);
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
const JORDAN_ROOM = "cf-room-jordan-gate-test";
const JORDAN_DISPATCH = {
  id: "dispatch-jordan-gate-test",
  cloudflare_room_id: JORDAN_ROOM,
  assigned_doctor_id: "dr-jordan",
  status: "matched",
  patient_id: null,
  requested_by_user_id: "user-jordan",
  care_country: "BR",
  referral_partner_id: "partner-jordan",
};
const JORDAN_APPROVED = {
  status: "approved",
  provider: "mercadopago",
  provider_payment_id: "123456789",
  paid_at: "2026-11-08T10:00:00Z",
  amount_minor: 7900,
  currency: "BRL",
};

const TEST_GUEST_SECRET = "autamedica-jordan-test-secret";

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeGuestToken(overrides: Partial<{
  callId: string; roomId: string; guestName: string; role: string; iat: number; exp: number;
}> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    callId: JORDAN_DISPATCH.id, roomId: JORDAN_ROOM, guestName: "Paciente Jordan",
    role: "guest", iat: now, exp: now + 7200, ...overrides,
  })));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(TEST_GUEST_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
}

for (const scenario of [
  { name: "without payment", payment: null, expected: 402 },
  { name: "pending", payment: { ...JORDAN_APPROVED, status: "pending" }, expected: 402 },
  { name: "refunded", payment: { ...JORDAN_APPROVED, status: "refunded" }, expected: 402 },
  { name: "wrong currency", payment: { ...JORDAN_APPROVED, currency: "ARS" }, expected: 402 },
  { name: "missing PSP ID", payment: { ...JORDAN_APPROVED, provider_payment_id: null }, expected: 402 },
  { name: "approved but unbound", payment: JORDAN_APPROVED, expected: 503 },
]) {
  Deno.test(`cloudflare-calls - Jordan media gate ${scenario.name}`, async () => {
    setEnv();
    const originalFetch = globalThis.fetch;
    let cfRequests = 0;
    const backend = mockSupabaseFetch({
      user: { id: "user-jordan" },
      call: null,
      dispatch: JORDAN_DISPATCH,
      partner: { code: "JORDAN", active: true },
      payment: scenario.payment,
    });
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("rtc.live.cloudflare.com")) cfRequests++;
      return backend(input, init);
    };
    try {
      const req = new Request("http://localhost/cloudflare-calls", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-valid-token" },
        body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
      });
      const res = await handler(req);
      assertEquals(res.status, scenario.expected);
      assertEquals(cfRequests, scenario.expected === 200 ? 1 : 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

Deno.test("cloudflare-calls - Jordan cannot cross into Argentina", async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-jordan" },
    call: null,
    dispatch: { ...JORDAN_DISPATCH, care_country: "AR" },
    partner: { code: "JORDAN", active: true },
    payment: JORDAN_APPROVED,
  });
  try {
    const res = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-valid-token" },
      body: JSON.stringify({ roomId: JORDAN_ROOM, path: "sessions/new", body: {} }),
    }));
    assertEquals(res.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cloudflare-calls - unresolved referral must fail closed", async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockSupabaseFetch({
    user: { id: "user-jordan" },
    call: null,
    dispatch: JORDAN_DISPATCH,
    partner: null,
    payment: JORDAN_APPROVED,
  });
  try {
    const res = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-valid-token" },
      body: JSON.stringify({ roomId: JORDAN_ROOM, path: "sessions/new", body: {} }),
    }));
    assertEquals(res.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


Deno.test("cloudflare-calls - verified paid Jordan records SFU owner and room before returning session", async () => {
  setEnv();
  Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "true");
  const originalFetch = globalThis.fetch;
  const backend = mockSupabaseFetch({
    user: { id: "user-jordan" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
    cfResponse: { status: 201, body: { sessionId: "jordan-session-001" } },
  });
  let stored = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/sfu_room_session_bindings")) {
      const value = JSON.parse(String(init?.body ?? "{}"));
      const item = Array.isArray(value) ? value[0] : value;
      assertEquals(item.session_id, "jordan-session-001");
      assertEquals(item.room_id, JORDAN_ROOM);
      assertEquals(item.principal_key, "user:user-jordan");
      stored++;
      return jsonResponse([], 201);
    }
    return backend(input,init);
  };
  try {
    const res = await handler(new Request("http://localhost/cloudflare-calls", {
      method:"POST", headers:{ Authorization:"Bearer synthetic-valid-token" },
      body:JSON.stringify({ roomId:JORDAN_ROOM,method:"POST",path:"sessions/new",
        body:{ sessionDescription:{type:"offer",sdp:"synthetic"} } }),
    }));
    assertEquals(res.status,201);
    assertEquals(stored,1);
    assertEquals((await res.json()).sessionId,"jordan-session-001");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "false");
  }
});

Deno.test("cloudflare-calls - Jordan rejects cross-room SFU track subscription", async () => {
  setEnv();
  Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "true");
  const originalFetch = globalThis.fetch;
  const backend = mockSupabaseFetch({
    user: { id: "user-jordan" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
  });
  let upstreamCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("rtc.live.cloudflare.com")) upstreamCalls++;
    if (url.includes("/rest/v1/sfu_room_session_bindings")) {
      if (url.includes("session_id=eq.")) {
        return jsonResponse([{ room_id:JORDAN_ROOM, principal_key:"user:user-jordan" }]);
      }
      return jsonResponse([{ session_id:"foreign-session",room_id:"another-room" }]);
    }
    return backend(input,init);
  };
  try {
    const res = await handler(new Request("http://localhost/cloudflare-calls", {
      method:"POST", headers:{ Authorization:"Bearer synthetic-valid-token" },
      body:JSON.stringify({
        roomId:JORDAN_ROOM,method:"POST",path:"sessions/jordan-session-001/tracks/new",
        body:{ tracks:[{location:"remote",sessionId:"foreign-session",trackName:"video0"}] },
      }),
    }));
    assertEquals(res.status,403);
    assertEquals(upstreamCalls,0);
  } finally {
    globalThis.fetch=originalFetch;
    Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "false");
  }
});

Deno.test("cloudflare-calls - Jordan accepts same-room authorized peer publication", async () => {
  setEnv();
  Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "true");
  const originalFetch = globalThis.fetch;
  const backend = mockSupabaseFetch({
    user: { id: "user-jordan" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
    cfResponse: { status: 200, body: { tracks: [{ trackName: "camera" }] } },
  });
  let upstreamCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("rtc.live.cloudflare.com")) upstreamCalls++;
    if (url.includes("/rest/v1/sfu_room_session_bindings")) {
      if (url.includes("session_id=eq.")) {
        return jsonResponse([{ room_id: JORDAN_ROOM, principal_key: "user:user-jordan" }]);
      }
      return jsonResponse([{ session_id: "doctor-session", room_id: JORDAN_ROOM }]);
    }
    return backend(input, init);
  };
  try {
    const res = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-valid-token" },
      body: JSON.stringify({
        roomId: JORDAN_ROOM,
        method: "POST",
        path: "sessions/patient-session/tracks/new",
        body: { tracks: [
          { location: "remote", sessionId: "doctor-session", trackName: "camera" },
        ] },
      }),
    }));
    assertEquals(res.status, 200);
    assertEquals(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "false");
  }
});


Deno.test("cloudflare-calls - guest approved R$79 binds SFU session to guest:<callId>", async () => {
  setEnv();
  Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "true");
  const originalFetch = globalThis.fetch;
  const bindingWrites: Array<Record<string, unknown>> = [];
  const backend = mockSupabaseFetch({
    user: { id: "unused-for-guest" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
    cfResponse: { status: 201, body: { sessionId: "guest-session-001" } }, bindingWrites,
  });
  let cloudflareCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("rtc.live.cloudflare.com")) cloudflareCalls++;
    return backend(input, init);
  };
  try {
    const token = await makeGuestToken();
    const response = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST", headers: { "x-guest-token": token },
      body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
    }));
    assertEquals(response.status, 201);
    assertEquals(cloudflareCalls, 1);
    assertEquals(bindingWrites, [{
      session_id: "guest-session-001", room_id: JORDAN_ROOM,
      principal_key: `guest:${JORDAN_DISPATCH.id}`,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "false");
  }
});

Deno.test("cloudflare-calls - pending Jordan guest payment returns 402 without SFU request", async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let cloudflareCalls = 0;
  const backend = mockSupabaseFetch({
    user: { id: "unused-for-guest" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true },
    payment: { ...JORDAN_APPROVED, status: "pending" },
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("rtc.live.cloudflare.com")) cloudflareCalls++;
    return backend(input, init);
  };
  try {
    const token = await makeGuestToken();
    const response = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST", headers: { "x-guest-token": token },
      body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
    }));
    assertEquals(response.status, 402);
    assertEquals(cloudflareCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("cloudflare-calls - a guest token cannot be replayed against another dispatch", async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let cloudflareCalls = 0;
  const backend = mockSupabaseFetch({
    user: { id: "unused-for-guest" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("rtc.live.cloudflare.com")) cloudflareCalls++;
    return backend(input, init);
  };
  try {
    const token = await makeGuestToken({ callId: "dispatch-other-patient" });
    const response = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST", headers: { "x-guest-token": token },
      body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
    }));
    assertEquals(response.status, 403);
    assertEquals(cloudflareCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("cloudflare-calls - guest cannot reuse SFU session bound to another guest principal", async () => {
  setEnv();
  Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "true");
  const originalFetch = globalThis.fetch;
  let cloudflareCalls = 0;
  const backend = mockSupabaseFetch({
    user: { id: "unused-for-guest" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
    sfuBindings: [{ session_id: "other-session", room_id: JORDAN_ROOM, principal_key: "guest:other-dispatch-id" }],
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("rtc.live.cloudflare.com")) cloudflareCalls++;
    return backend(input, init);
  };
  try {
    const token = await makeGuestToken();
    const response = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST", headers: { "x-guest-token": token },
      body: JSON.stringify({
        roomId: JORDAN_ROOM, method: "PUT",
        path: "sessions/other-session/tracks/close", body: {},
      }),
    }));
    assertEquals(response.status, 403);
    assertEquals(cloudflareCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("SFU_SESSION_BINDINGS_ENABLED", "false");
  }
});

Deno.test("cloudflare-calls - invalid bearer JWT never falls back to a valid guest token", async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let cloudflareCalls = 0;
  const backend = mockSupabaseFetch({
    user: { id: "user-jordan" }, call: null, dispatch: JORDAN_DISPATCH,
    partner: { code: "JORDAN", active: true }, payment: JORDAN_APPROVED,
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("rtc.live.cloudflare.com")) cloudflareCalls++;
    if (String(input).includes("/auth/v1/user")) return jsonResponse({ message: "invalid JWT" }, 401);
    return backend(input, init);
  };
  try {
    const token = await makeGuestToken();
    const response = await handler(new Request("http://localhost/cloudflare-calls", {
      method: "POST",
      headers: { Authorization: "Bearer forged-user-jwt", "x-guest-token": token },
      body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
    }));
    assertEquals(response.status, 401);
    assertEquals(cloudflareCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});


Deno.test("cloudflare-calls - expired guest HMAC is rejected before dispatch lookup", async () => {
  setEnv();
  const token = await makeGuestToken({ exp: Math.floor(Date.now() / 1000) - 1 });
  const response = await handler(new Request("http://localhost/cloudflare-calls", {
    method: "POST", headers: { "x-guest-token": token },
    body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
  }));
  assertEquals(response.status, 401);
});

Deno.test("cloudflare-calls - tampered guest HMAC is rejected before dispatch lookup", async () => {
  setEnv();
  const token = await makeGuestToken();
  const parts = token.split(".");
  parts[1] = parts[1].slice(0, -1) + (parts[1].endsWith("A") ? "B" : "A");
  const response = await handler(new Request("http://localhost/cloudflare-calls", {
    method: "POST", headers: { "x-guest-token": parts.join(".") },
    body: JSON.stringify({ roomId: JORDAN_ROOM, method: "POST", path: "sessions/new", body: {} }),
  }));
  assertEquals(response.status, 401);
});
