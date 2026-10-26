import { assertEquals } from "@std/assert";
import { handler } from "../patients-wallet-topup/index.ts";

Deno.test("patients-wallet-topup - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/patients-wallet-topup", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("patients-wallet-topup - Method Not Allowed (GET)", async () => {
  const req = new Request("http://localhost/patients-wallet-topup", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.error, "Method not allowed");
});

Deno.test("patients-wallet-topup - Missing Authorization Header", async () => {
  const req = new Request("http://localhost/patients-wallet-topup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1500 }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Missing authorization header");
});

Deno.test("patients-wallet-topup - Invalid amount (negative or 0)", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123", email: "patient@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-wallet-topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer dummy-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: -50 }),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.error, "invalid_amount");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("patients-wallet-topup - Successful preference creation", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
  Deno.env.set("MERCADOPAGO_ACCESS_TOKEN", "mp_test_token");
  Deno.env.set("APP_URL", "https://www.autamedica.com");

  let mpPayloadSent: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({
          id: "user-123",
          email: "user@example.com",
          user_metadata: { role: "patient" },
        }),
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
        JSON.stringify({ email: "profile@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("api.mercadopago.com/checkout/preferences") && method === "POST") {
      mpPayloadSent = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          id: "pref-topup-456",
          init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-topup-456",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-wallet-topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 2500.5 }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.preferenceId, "pref-topup-456");
    assertEquals(data.checkoutUrl, "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-topup-456");
    assertEquals(data.amountCents, 250050);
    assertEquals(data.currency, "BRL");

    // Check payload sent to MP
    const sent = mpPayloadSent as Record<string, unknown> | null;
    assertEquals(sent?.payer, { email: "profile@example.com" });
    const metadata = sent?.metadata as Record<string, unknown>;
    assertEquals(metadata?.type, "wallet_topup");
    assertEquals(metadata?.patient_id, "patient-123");
    assertEquals(metadata?.amount_cents, 250050);
    const items = sent?.items as Array<{ currency_id?: string }>;
    assertEquals(items?.[0]?.currency_id, "BRL");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("patients-wallet-topup - MercadoPago error returns 502", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
  Deno.env.set("MERCADOPAGO_ACCESS_TOKEN", "mp_test_token");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123", email: "user@example.com" }),
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
        JSON.stringify({ email: "user@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("api.mercadopago.com/checkout/preferences")) {
      return new Response(
        JSON.stringify({ message: "Invalid access token", error: "bad_request", status: 400 }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-wallet-topup", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 1000 }),
    });

    const res = await handler(req);
    assertEquals(res.status, 502);
    const data = await res.json();
    assertEquals(data.error, "Failed to create MercadoPago preference");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
