/**
 * Intercambia el code de OAuth por un access token.
 * Uso: LINKEDIN_CODE=xxx bun scripts/linkedin-auth-complete.ts
 * Redirect URIs autorizadas: localhost:8888, linkedin.com/developers/tools/oauth/redirect, localhost:3000
 */

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "77up4qg7rt1a09";
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";
const CODE = process.env.LINKEDIN_CODE || "";
const REDIRECT_URI = "http://localhost:8888/callback";

if (!CODE) {
  console.error("❌ Ejecutá: export LINKEDIN_CODE=TU_CODIGO && bun scripts/linkedin-auth-complete.ts");
  process.exit(1);
}

const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: CODE,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }).toString(),
});

const data = await res.json() as any;
if (data.access_token) {
  console.log("✅ TOKEN:", data.access_token);
  console.log("");
  console.log("echo 'LINKEDIN_ACCESS_TOKEN=" + data.access_token + "' >> .env");
} else {
  console.error("❌", JSON.stringify(data, null, 2));
}
