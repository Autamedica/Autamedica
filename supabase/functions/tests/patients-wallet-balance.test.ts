import { assertEquals } from "@std/assert";
import { handler } from "../patients-wallet-balance/index.ts";

Deno.test("patients-wallet-balance - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/patients-wallet-balance", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("patients-wallet-balance - Method Not Allowed (PUT)", async () => {
  const req = new Request("http://localhost/patients-wallet-balance", {
    method: "PUT",
  });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.error, "Method not allowed");
});

Deno.test("patients-wallet-balance - Missing Authorization Header", async () => {
  const req = new Request("http://localhost/patients-wallet-balance", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Missing authorization header");
});

Deno.test("patients-wallet-balance - Returns zeros when patient does not exist", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-without-patient" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify(null),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/patients-wallet-balance", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data, {
      available_credit_cents: 0,
      locked_credit_cents: 0,
      total_credit_cents: 0,
      currency: "ARS",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("patients-wallet-balance - Returns balance from RPC via GET and POST", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-patient-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-1", user_id: "user-patient-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/rpc/patient_wallet_get_balance")) {
      return new Response(
        JSON.stringify([
          {
            patient_id: "patient-1",
            available_credit_cents: 150000,
            locked_credit_cents: 20000,
            total_credit_cents: 170000,
            currency: "ARS",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return await originalFetch(input, init);
  };

  try {
    // Test GET
    const reqGet = new Request("http://localhost/patients-wallet-balance", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });
    const resGet = await handler(reqGet);
    assertEquals(resGet.status, 200);
    const dataGet = await resGet.json();
    assertEquals(dataGet, {
      available_credit_cents: 150000,
      locked_credit_cents: 20000,
      total_credit_cents: 170000,
      currency: "ARS",
    });

    // Test POST
    const reqPost = new Request("http://localhost/patients-wallet-balance", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    const resPost = await handler(reqPost);
    assertEquals(resPost.status, 200);
    const dataPost = await resPost.json();
    assertEquals(dataPost, {
      available_credit_cents: 150000,
      locked_credit_cents: 20000,
      total_credit_cents: 170000,
      currency: "ARS",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
