package com.autamedica.companion;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Pure read-only passive detector for screens that require human intervention
 * (expired login, 2FA/OTP prompt, or manual verification check).
 * Never clicks, submits forms, or interacts with challenges.
 */
final class HumanGateDetector {

    enum GateKind {
        NONE,
        LOGIN_REQUIRED,
        TWO_FACTOR_AUTH,
        HUMAN_VERIFICATION
    }

    static final class PageObservation {
        final String url;
        final String title;
        final String visibleText;
        final boolean hasPasswordInput;
        final boolean hasOtpInput;
        final int httpStatus;

        PageObservation(
                String url,
                String title,
                String visibleText,
                boolean hasPasswordInput,
                boolean hasOtpInput,
                int httpStatus) {
            this.url = url == null ? "" : url;
            this.title = title == null ? "" : title;
            this.visibleText = visibleText == null ? "" : visibleText;
            this.hasPasswordInput = hasPasswordInput;
            this.hasOtpInput = hasOtpInput;
            this.httpStatus = httpStatus;
        }
    }

    static final class GateSignal {
        final boolean detected;
        final GateKind kind;
        final String matchedRule;
        final String url;
        final String summary;

        GateSignal(boolean detected, GateKind kind, String matchedRule, String url, String summary) {
            this.detected = detected;
            this.kind = kind;
            this.matchedRule = matchedRule == null ? "" : matchedRule;
            this.url = url == null ? "" : url;
            this.summary = summary == null ? "" : summary;
        }

        static GateSignal none(String url) {
            return new GateSignal(false, GateKind.NONE, "", url, "No human intervention required");
        }
    }

    private static final Pattern OTP_TEXT_PATTERN = Pattern.compile(
        "(two[- ]factor|2fa|one[- ]time[- ]code|verification code|authenticator code|"
        + "c[oó]digo de verificaci[oó]n|c[oó]digo de seguran[cç]a|segundo factor|token sms|otp)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern OTP_URL_PATTERN = Pattern.compile(
        "(/2fa|/mfa|/otp|two-factor|verify-code|checkpoint)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern HUMAN_CHECK_PATTERN = Pattern.compile(
        "(verify you are human|are you human|human verification|security check|just a moment|"
        + "checking your browser|attention required|comple[aá] el desaf[ií]o|verificaci[oó]n humana|"
        + "confirme que (voc[eê]|eres) humano|recaptcha|hcaptcha|turnstile|cf-challenge)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern HUMAN_CHECK_URL_PATTERN = Pattern.compile(
        "(/cdn-cgi/challenge|challenge-platform|__cf_chl|arkose|human-check)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern LOGIN_URL_PATTERN = Pattern.compile(
        "(/login|/signin|/sign-in|/auth/login|/oauth/authorize|/session/new|accounts\\.google\\.com|login\\.microsoftonline\\.com)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern SESSION_EXPIRED_PATTERN = Pattern.compile(
        "(sign in to continue|log in to continue|session expired|sesi[oó]n expirada|"
        + "iniciar sesi[oó]n|inicie sesi[oó]n|fa[cç]a login|entrar na conta|unauthorized)",
        Pattern.CASE_INSENSITIVE);

    private HumanGateDetector() {}

    static GateSignal inspect(PageObservation obs) {
        if (obs == null) {
            return GateSignal.none("");
        }
        String urlLower = obs.url.toLowerCase(Locale.ROOT);
        String combinedText = (obs.title + "\n" + obs.visibleText).toLowerCase(Locale.ROOT);

        // 1. Two-factor authentication / OTP check
        if (obs.hasOtpInput) {
            return new GateSignal(true, GateKind.TWO_FACTOR_AUTH, "otp_input_field", obs.url,
                "OTP / 2FA input detected; awaiting user code");
        }
        if (OTP_URL_PATTERN.matcher(urlLower).find() || OTP_TEXT_PATTERN.matcher(combinedText).find()) {
            return new GateSignal(true, GateKind.TWO_FACTOR_AUTH, "otp_text_or_url", obs.url,
                "2FA / verification code prompt detected; awaiting user");
        }

        // 2. Passive manual human verification detection (pauses for user takeover only)
        if (HUMAN_CHECK_URL_PATTERN.matcher(urlLower).find()
                || HUMAN_CHECK_PATTERN.matcher(combinedText).find()) {
            return new GateSignal(true, GateKind.HUMAN_VERIFICATION, "human_verification_prompt", obs.url,
                "Manual verification screen detected; paused for user takeover");
        }

        // 3. Login / expired session check
        if (obs.httpStatus == 401) {
            return new GateSignal(true, GateKind.LOGIN_REQUIRED, "http_401", obs.url,
                "HTTP 401 authentication required; awaiting user sign-in");
        }
        if (obs.hasPasswordInput && LOGIN_URL_PATTERN.matcher(urlLower).find()) {
            return new GateSignal(true, GateKind.LOGIN_REQUIRED, "login_url_with_password", obs.url,
                "Login form detected; awaiting user authentication");
        }
        if (obs.hasPasswordInput && SESSION_EXPIRED_PATTERN.matcher(combinedText).find()) {
            return new GateSignal(true, GateKind.LOGIN_REQUIRED, "session_expired_prompt", obs.url,
                "Expired session login prompt detected; awaiting user sign-in");
        }

        return GateSignal.none(obs.url);
    }
}
