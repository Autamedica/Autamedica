const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { reportText, userName, userContact } = await req.json();

    if (!reportText) {
      return new Response(JSON.stringify({ error: "reportText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const patientName = userName ? userName.trim() : "Anónimo";
    const patientContact = userContact ? userContact.trim() : "No especificado";

    const payload = {
      sender: { name: "AutaMedica Tamizaje", email: "contacto@autamedica.com" },
      to: [{ email: "contacto@autamedica.com" }],
      subject: `[TDAH Lead] Nuevo Reporte - ${patientName}`,
      templateId: 8,
      params: {
        subject: `[TDAH Lead] Nuevo Reporte - ${patientName}`,
        title: `Reporte de Tamizaje TDAH: ${patientName}`,
        subtitle: `Contacto del Paciente: ${patientContact}`,
        body_html: `<pre style="font-family: monospace; font-size: 13px; background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; white-space: pre-wrap;">${escapeHtml(reportText)}</pre>`,
        cta_url: "https://autamedica.com",
        cta_label: "Ir a AutaMedica",
        secondary_url: `mailto:contacto@autamedica.com?subject=Contacto%20${encodeURIComponent(patientName)}`,
        secondary_label: "Responder a AutaMedica",
        signature_name: "AutaMedica Leads System",
      }
    };

    // Timeout de 4 segundos para evitar Gateway Timeouts (504) causados por latencias del SMTP externo
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(BREVO_URL, {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: `Brevo error: ${errorText}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const error = err instanceof Error ? err : new Error(String(err));
      const isTimeout = error.name === 'AbortError';
      return new Response(JSON.stringify({ error: isTimeout ? "Brevo request timed out" : error.message }), {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
