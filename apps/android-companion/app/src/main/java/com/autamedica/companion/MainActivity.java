package com.autamedica.companion;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.security.SecureRandom;

public final class MainActivity extends Activity {
    private static final String TOKEN_KEY = "control_token";
    private final android.os.Handler handler = new android.os.Handler();
    private TextView statusView;

    private final Runnable refreshStatus = new Runnable() {
        @Override public void run() {
            if (statusView != null) {
                boolean connected = AccessibilityControlService.isConnected();
                boolean notifications = CompanionNotificationListenerService.isConnected();
                statusView.setText((connected
                    ? "Accesibilidad: ACTIVA"
                    : "Accesibilidad: pendiente de autorización")
                    + "\nControl Android: 127.0.0.1:" + BuildConfig.CONTROL_PORT
                    + "\nChromium CDP: 127.0.0.1:" + BuildConfig.CDP_PORT
                    + "\nNotificaciones: " + (notifications ? "ACTIVAS" : "Permiso pendiente")
                    + "\nInternet: habilitado\nSesiones web: perfil persistente");
            }
            handler.postDelayed(this, 1500);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String token = getOrCreateToken();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(26), dp(22), dp(28));

        TextView title = new TextView(this);
        title.setText("Autamedica Companion");
        title.setTextSize(24);
        title.setTextColor(0xFF10243A);
        root.addView(title, matchWrap());

        TextView intro = new TextView(this);
        intro.setText("Navegador Chromium del sistema, Playwright por CDP y control nativo de Android. El navegador utiliza Wi-Fi o datos móviles.");
        intro.setTextSize(15);
        intro.setPadding(0, dp(10), 0, dp(18));
        root.addView(intro, matchWrap());

        statusView = new TextView(this);
        statusView.setTextSize(15);
        statusView.setPadding(0, dp(8), 0, dp(12));
        root.addView(statusView, matchWrap());

        Button enable = new Button(this);
        enable.setText("Activar control de accesibilidad");
        enable.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(enable, matchWrap());

        Button notificationAccess = new Button(this);
        notificationAccess.setText("Activar acceso a notificaciones");
        notificationAccess.setOnClickListener(v ->
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        root.addView(notificationAccess, matchWrap());

        Button runBackground = new Button(this);
        runBackground.setText("Mantener navegador activo con pantalla apagada");
        runBackground.setOnClickListener(v -> {
            Intent browser = new Intent(this, BrowserActivity.class);
            browser.putExtra("url", SecureVault.get(this, "browser.lastUrl", "https://www.google.com"));
            startActivity(browser);
            startBackgroundRuntime();
        });
        root.addView(runBackground, matchWrap());

        Button stopBackground = new Button(this);
        stopBackground.setText("Detener sesión en segundo plano");
        stopBackground.setOnClickListener(v -> stopBackgroundRuntime());
        root.addView(stopBackground, matchWrap());

        Button battery = new Button(this);
        battery.setText("Configurar batería sin restricciones");
        battery.setOnClickListener(v -> {
            android.os.PowerManager power = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= 23 && !power.isIgnoringBatteryOptimizations(getPackageName())) {
                try {
                    startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName())));
                    return;
                } catch (Exception ignored) {}
            }
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())));
            }
        });
        root.addView(battery, matchWrap());

        TextView tokenTitle = new TextView(this);
        tokenTitle.setText("Token privado de emparejamiento");
        tokenTitle.setTextSize(15);
        tokenTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(tokenTitle, matchWrap());

        TextView tokenView = new TextView(this);
        tokenView.setText(token);
        tokenView.setTextIsSelectable(true);
        tokenView.setTextSize(12);
        tokenView.setPadding(dp(12), dp(12), dp(12), dp(12));
        tokenView.setBackgroundColor(0xFFEAF0F6);
        root.addView(tokenView, matchWrap());

        Button copy = new Button(this);
        copy.setText("Copiar token MCP/CDP");
        copy.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("Autamedica Companion token", tokenView.getText()));
            copy.setText("Token copiado");
        });
        root.addView(copy, matchWrap());

        Button rotate = new Button(this);
        rotate.setText("Rotar token y revocar conexiones anteriores");
        rotate.setOnClickListener(v -> {
            String replacement = createToken();
            try {
                SecureVault.put(this, TOKEN_KEY, replacement);
                tokenView.setText(replacement);
                copy.setText("Copiar token MCP/CDP");
            } catch (Exception error) {
                tokenView.setText("No se pudo guardar el token seguro: " + error.getClass().getSimpleName());
            }
        });
        root.addView(rotate, matchWrap());

        TextView vaultTitle = new TextView(this);
        vaultTitle.setText("Bóveda cifrada de claves");
        vaultTitle.setTextSize(17);
        vaultTitle.setPadding(0, dp(24), 0, dp(8));
        root.addView(vaultTitle, matchWrap());

        EditText keyName = new EditText(this);
        keyName.setSingleLine(true);
        keyName.setHint("Nombre de clave (ej. OPENAI_API_KEY)");
        keyName.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        root.addView(keyName, matchWrap());

        EditText keyValue = new EditText(this);
        keyValue.setSingleLine(true);
        keyValue.setHint("Valor secreto");
        keyValue.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(keyValue, matchWrap());

        Button saveSecret = new Button(this);
        saveSecret.setText("Guardar clave cifrada");
        saveSecret.setOnClickListener(v -> {
            String name = keyName.getText().toString().trim();
            String value = keyValue.getText().toString();
            try {
                SecureVault.put(this, name, value);
                keyValue.setText("");
                keyName.setText("");
                saveSecret.setText("Clave guardada en Android Keystore");
            } catch (Exception error) {
                saveSecret.setText("Error: " + error.getClass().getSimpleName());
            }
        });
        root.addView(saveSecret, matchWrap());

        Button showSecrets = new Button(this);
        showSecrets.setText("Ver nombres de claves guardadas");
        showSecrets.setOnClickListener(v -> {
            java.util.Set<String> names = SecureVault.names(this);
            names.remove(TOKEN_KEY);
            showSecrets.setText(names.isEmpty() ? "No hay claves guardadas" : String.join(", ", names));
        });
        root.addView(showSecrets, matchWrap());

        TextView instructions = new TextView(this);
        instructions.setText("\nLas cookies, localStorage e IndexedDB se conservan en el perfil privado del navegador. Las claves guardadas aquí se cifran con una clave no exportable de Android Keystore.\n\nEl modo de pantalla apagada usa un servicio en primer plano y un bloqueo parcial de CPU mientras la sesión esté activa. Podés detenerlo desde la notificación.");
        instructions.setTextSize(13);
        instructions.setPadding(0, dp(16), 0, 0);
        root.addView(instructions, matchWrap());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
        requestNotificationPermission();
        handler.post(refreshStatus);
    }

    private void startBackgroundRuntime() {
        Intent intent = new Intent(this, CompanionRuntimeService.class)
            .setAction(CompanionRuntimeService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
        else startService(intent);
    }

    private void stopBackgroundRuntime() {
        Intent intent = new Intent(this, CompanionRuntimeService.class)
            .setAction(CompanionRuntimeService.ACTION_STOP);
        startService(intent);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 18770);
        }
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
        String token = SecureVault.get(this, TOKEN_KEY, null);
        if (token == null || token.length() < 64) {
            // One-time migration from the initial debug build's private preferences.
            String previous = getSharedPreferences("companion_private", MODE_PRIVATE).getString(TOKEN_KEY, null);
            token = previous != null && previous.length() >= 64 ? previous : createToken();
            try {
                SecureVault.put(this, TOKEN_KEY, token);
                getSharedPreferences("companion_private", MODE_PRIVATE).edit().remove(TOKEN_KEY).apply();
            } catch (Exception error) {
                throw new IllegalStateException("Android Keystore could not initialize the secure companion token", error);
            }
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
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
}
