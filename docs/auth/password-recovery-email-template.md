# Supabase password recovery email template

Autamedica's recovery email must not link directly to Supabase's single-use `{{ .ConfirmationURL }}`. Some email security scanners prefetch confirmation links and consume the OTP before the user opens the email.

In Supabase Dashboard → Authentication → Email Templates → Reset Password, replace the confirmation link with:

```html
<h2>Recuperar senha da Autamedica</h2>
<p>Recebemos uma solicitação para redefinir sua senha.</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Continuar para redefinir a senha</a></p>
<p>Se você não solicitou esta alteração, ignore este e-mail.</p>
```

The app loads `/auth/reset-password?token_hash=...&type=recovery` without redeeming the token. Only the user's explicit click on **Continuar para alterar a senha** calls `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`. The resulting session unlocks the new-password form.

Keep the redirect URL allow-list restricted to the actual Autamedica origins. Do not add wildcard external domains. Disable SMTP click-tracking/rewrite for Auth links where the mail provider supports it.

After updating the template, verify with a dedicated test account: request recovery, inspect the raw email link, open it once, explicitly confirm on the page, submit a password of at least the production-required length, then sign in with the new password and verify the old password fails.

**Deployment gate:** this template is a Supabase Dashboard setting, not a repository file. The code change alone does not switch production email links to the scanner-safe token-hash flow.
