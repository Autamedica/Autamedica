import { assertEquals } from "jsr:@std/assert";
import { handler } from "../turn-credentials/index.ts";

Deno.test("turn-credentials - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/turn-credentials", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("turn-credentials - Method Not Allowed", async () => {
  const req = new Request("http://localhost/turn-credentials", {
    method: "DELETE",
  });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.error, "Method not allowed");
});

Deno.test("turn-credentials - Missing Authorization Header", async () => {
  const req = new Request("http://localhost/turn-credentials", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Missing authorization header");
});

Deno.test("turn-credentials - STUN fallback when CF credentials missing", async () => {
  // Set Supabase env vars to dummy for test
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
  Deno.env.delete("CLOUDFLARE_CALLS_TURN_KEY_ID");
  Deno.env.delete("CLOUDFLARE_CALLS_TURN_TOKEN");

  // Mock global fetch to handle Supabase auth and return valid doctor user
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({
          id: "user-123",
          app_metadata: { role: "doctor" },
          user_metadata: { role: "doctor" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/turn-credentials", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.ok, true);
    assertEquals(data.iceServers.length, 2);
    assertEquals(data.iceServers[0].urls[0], "stun:stun.l.google.com:19302");
    assertEquals(res.headers.get("Cache-Control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("turn-credentials - Cloudflare Calls TURN generation with port 53 filtering", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
  Deno.env.set("CLOUDFLARE_CALLS_TURN_KEY_ID", "cf-key-123");
  Deno.env.set("CLOUDFLARE_CALLS_TURN_TOKEN", "cf-token-abc");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({
          id: "patient-user-123",
          app_metadata: { role: "patient" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("rtc.live.cloudflare.com")) {
      return new Response(
        JSON.stringify({
          iceServers: [
            {
              urls: ["turn:turn.cloudflare.com:53?transport=udp", "turn:turn.cloudflare.com:3478?transport=udp"],
              username: "turn-user",
              credential: "turn-password",
            },
            {
              urls: ["turn:turn.cloudflare.com:53?transport=tcp"],
              username: "turn-user-2",
              credential: "turn-password-2",
            },
            {
              urls: "turn:turn.cloudflare.com:443?transport=tcp",
              username: "turn-user-3",
              credential: "turn-password-3",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/turn-credentials", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Cache-Control"), "private, max-age=86100");
    const data = await res.json();
    assertEquals(data.ok, true);

    // Port 53 must be filtered out
    // First entry should only have 3478
    assertEquals(data.iceServers[0].urls, ["turn:turn.cloudflare.com:3478?transport=udp"]);
    // Second entry only had port 53, so it must have been removed completely
    assertEquals(data.iceServers.length, 2);
    // Third entry had 443
    assertEquals(data.iceServers[1].urls, ["turn:turn.cloudflare.com:443?transport=tcp"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
