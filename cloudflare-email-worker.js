/**
 * Cloudflare Email Worker: Auto-reply para contacto@autamedica.com
 * 
 * Intercepta emails entrantes, llama al Edge Function de Supabase
 * para enviar auto-reply, y reenvía el email original a Gmail.
 * 
 * Pegar este código en Cloudflare Dashboard > Email Routing > Email Workers > Create
 */

export default {
  async email(message, env, ctx) {
    const senderEmail = message.from;
    const senderName = message.headers.get("from") || senderEmail;
    
    // Extraer nombre del header From (formato: "Nombre <email@example.com>")
    const nameMatch = senderName.match(/^"?([^"<]+)"?\s*</);
    const cleanName = nameMatch ? nameMatch[1].trim() : "";

    // No auto-responder a estos
    const noReplyPatterns = [
      "noreply", "no-reply", "mailer-daemon", "postmaster", "bounce",
      "autamedica.com", "sendinblue.com", "brevo.com", "github.com",
      "getsentry.com", "googleusercontent.com"
    ];
    
    const shouldSkip = noReplyPatterns.some(p => senderEmail.toLowerCase().includes(p));
    
    if (!shouldSkip) {
      // Llamar al Edge Function para enviar auto-reply
      try {
        const webhookUrl = "https://qxjjrpksmwwrmubhvjew.supabase.co/functions/v1/brevo-inbound-webhook";
        
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{
              From: { Address: senderEmail, Name: cleanName },
              To: [{ Address: message.to }],
              Subject: message.headers.get("subject") || "(sin asunto)",
            }]
          })
        });
        
        console.log(`Auto-reply triggered for: ${senderEmail}`);
      } catch (err) {
        // No bloquear el reenvío si falla el auto-reply
        console.error("Auto-reply error:", err);
      }
    }
    
    // Siempre reenviar el email original a Gmail
    await message.forward("marques.eduardo95466020@gmail.com");
  }
}
