package com.autamedica.companion;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.security.SecureRandom;

public final class MainActivity extends Activity {
    private static final String PREFS = "companion_private";
    private static final String TOKEN_KEY = "control_token";
    private final android.os.Handler handler = new android.os.Handler();
    private TextView statusView;

    private final Runnable refreshStatus = new Runnable() {
        @Override public void run() {
            if (statusView != null) {
                boolean connected = AccessibilityControlService.isConnected();
                statusView.setText(connected
                    ? "Servicio de accesibilidad: ACTIVO\nAndroid control: 127.0.0.1:18765\nChromium CDP: 127.0.0.1:18766\nNavegación por Internet: habilitada"
                    : "Servicio de accesibilidad: pendiente de autorización");
            }
            handler.postDelayed(this, 1500);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String token = getOrCreateToken();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(28), dp(24), dp(24));

        TextView title = new TextView(this);
        title.setText("Autamedica Android Companion");
        title.setTextSize(23);
        title.setTextColor(0xFF10243A);
        root.addView(title, matchWrap());

        TextView intro = new TextView(this);
        intro.setText("Conecta Codex con Android. El servidor opera solo en 127.0.0.1 y no acepta conexiones desde Wi-Fi.");
        intro.setTextSize(15);
        intro.setPadding(0, dp(12), 0, dp(16));
        root.addView(intro, matchWrap());

        statusView = new TextView(this);
        statusView.setTextSize(16);
        statusView.setPadding(0, dp(8), 0, dp(16));
        root.addView(statusView, matchWrap());

        Button enable = new Button(this);
        enable.setText("Activar servicio de accesibilidad");
        enable.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(enable, matchWrap());

        TextView tokenTitle = new TextView(this);
        tokenTitle.setText("Token privado para emparejar Codex");
        tokenTitle.setTextSize(15);
        tokenTitle.setPadding(0, dp(20), 0, dp(8));
        root.addView(tokenTitle, matchWrap());

        TextView tokenView = new TextView(this);
        tokenView.setText(token);
        tokenView.setTextIsSelectable(true);
        tokenView.setTextSize(13);
        tokenView.setPadding(dp(12), dp(12), dp(12), dp(12));
        tokenView.setBackgroundColor(0xFFEAF0F6);
        root.addView(tokenView, matchWrap());

        Button copy = new Button(this);
        copy.setText("Copiar token");
        copy.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("Autamedica Companion token", tokenView.getText()));
            copy.setText("Token copiado");
        });
        root.addView(copy, matchWrap());

        Button rotate = new Button(this);
        rotate.setText("Generar token nuevo");
        rotate.setOnClickListener(v -> {
            String replacement = createToken();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(TOKEN_KEY, replacement).apply();
            tokenView.setText(replacement);
            copy.setText("Copiar token");
        });
        root.addView(rotate, matchWrap());

        TextView instructions = new TextView(this);
        instructions.setText("\nDespués de activar el servicio, instalá el conector MCP en Termux y pegá el token. No compartas este token: permite controlar este teléfono desde procesos locales.");
        instructions.setTextSize(13);
        root.addView(instructions, matchWrap());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
        handler.post(refreshStatus);
    }

    @Override protected void onResume() {
        super.onResume();
        handler.removeCallbacks(refreshStatus);
        handler.post(refreshStatus);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(refreshStatus);
        super.onPause();
    }

    private String getOrCreateToken() {
        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String token = prefs.getString(TOKEN_KEY, null);
        if (token == null || token.length() < 64) {
            token = createToken();
            prefs.edit().putString(TOKEN_KEY, token).apply();
        }
        return token;
    }

    private String createToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder out = new StringBuilder(64);
        for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b));
        return out.toString();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }
}
