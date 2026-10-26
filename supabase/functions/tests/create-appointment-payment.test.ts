import { assertEquals } from "jsr:@std/assert";
import { handler } from "../create-appointment-payment/index.ts";

Deno.test("create-appointment-payment - OPTIONS preflight", async () => {
  const req = new Request("http://localhost/create-appointment-payment", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("create-appointment-payment - Method Not Allowed", async () => {
  const req = new Request("http://localhost/create-appointment-payment", {
    method: "GET",
  });
  const res = await handler(req);
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.error, "Method not allowed");
});

Deno.test("create-appointment-payment - Missing Authorization Header", async () => {
  const req = new Request("http://localhost/create-appointment-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId: "appt-123" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Missing authorization header");
});

Deno.test("create-appointment-payment - Missing appointmentId in body", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-123", user_id: "user-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/create-appointment-payment", {
      method: "POST",
      headers: {
        Authorization: "Bearer dummy-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.error, "Missing required field: appointmentId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("create-appointment-payment - Wallet payment when balance is sufficient", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-patient-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-1", user_id: "user-patient-1", cpf: "12345678901", dni: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/appointments") && method === "GET") {
      return new Response(
        JSON.stringify({
          id: "appt-999",
          patient_id: "patient-1",
          doctor_id: "doctor-1",
          status: "pending_payment",
          doctor: {
            uf_brazil: "RS",
            id: "doctor-1",
            consultation_fee: 150000,
            payout_cbu: "1234567890123456789012",
            payout_alias: "DOCTOR.TEST",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/appointment_payments") && method === "GET") {
      return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/patient_wallets")) {
      return new Response(JSON.stringify({ currency: "BRL" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rpc/patient_wallet_get_balance")) {
      return new Response(
        JSON.stringify([
          {
            patient_id: "patient-1",
            available_credit_cents: 200000,
            locked_credit_cents: 0,
            total_credit_cents: 200000,
            currency: "BRL",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rpc/pay_appointment_with_patient_wallet")) {
      return new Response(
        JSON.stringify([
          {
            success: true,
            appointment_payment_id: "payment-wallet-uuid",
            amount_cents: 150000,
            new_available_credit_cents: 50000,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/appointments") && method === "PATCH") {
      return new Response(JSON.stringify({ status: "confirmed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/create-appointment-payment", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ appointmentId: "appt-999" }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.ok, true);
    assertEquals(data.status, "approved");
    assertEquals(data.payment_source, "patient_wallet");
    assertEquals(data.appointment_payment_id, "payment-wallet-uuid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("create-appointment-payment - MercadoPago preference when wallet balance is insufficient", async () => {
  Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "dummy_anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy_service_role");
  Deno.env.set("MERCADOPAGO_ACCESS_TOKEN_AR", "APP_USR_AR_TEST_TOKEN");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-patient-2" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/patients")) {
      return new Response(
        JSON.stringify({ id: "patient-2", user_id: "user-patient-2", dni: "30123456", cpf: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/appointments") && method === "GET") {
      return new Response(
        JSON.stringify({
          id: "appt-888",
          patient_id: "patient-2",
          doctor_id: "doctor-2",
          status: "pending_payment",
          doctor: {
            refeps_id: "REFEPS-AR",
            id: "doctor-2",
            consultation_fee: 120000,
            payout_cbu: "1234567890123456789012",
            payout_alias: "DOC.ALIAS",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/appointment_payments") && method === "GET") {
      return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/patient_wallets")) {
      return new Response(JSON.stringify({ currency: "ARS" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rpc/patient_wallet_get_balance")) {
      return new Response(
        JSON.stringify([
          {
            patient_id: "patient-2",
            available_credit_cents: 0,
            locked_credit_cents: 0,
            total_credit_cents: 0,
            currency: "ARS",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("api.mercadopago.com/checkout/preferences")) {
      const payload = JSON.parse(String(init?.body));
      assertEquals(payload.notification_url,
        "https://dummy.supabase.co/functions/v1/mobile-payments-webhook?market=AR");
      return new Response(
        JSON.stringify({
          id: "pref-mp-123456",
          init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-mp-123456",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/appointment_payments") && (method === "POST" || method === "PUT")) {
      return new Response(JSON.stringify({ id: "payment-row-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/appointments") && method === "PATCH") {
      return new Response(JSON.stringify({ status: "payment_pending" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };

  try {
    const req = new Request("http://localhost/create-appointment-payment", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ appointmentId: "appt-888" }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.ok, true);
    assertEquals(data.status, "pending");
    assertEquals(data.payment_source, "mercadopago");
    assertEquals(data.preference_id, "pref-mp-123456");
    assertEquals(data.checkout_url, "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-mp-123456");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
