package com.autamedica.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** AES-256-GCM vault with a non-exportable Android Keystore key. */
final class SecureVault {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "autamedica.companion.vault.aes.v1";
    private static final String PREFS = "companion_vault_ciphertext";
    private static final String PREFIX = "v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private SecureVault() {}

    static synchronized void put(Context context, String name, String value) throws Exception {
        validateName(name);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        ByteBuffer output = ByteBuffer.allocate(IV_BYTES + encrypted.length);
        output.put(cipher.getIV());
        output.put(encrypted);
        prefs(context).edit().putString(name, PREFIX + Base64.encodeToString(output.array(), Base64.NO_WRAP)).commit();
    }

    static synchronized String get(Context context, String name, String fallback) {
        try {
            validateName(name);
            String stored = prefs(context).getString(name, null);
            if (stored == null || !stored.startsWith(PREFIX)) return fallback;
            byte[] payload = Base64.decode(stored.substring(PREFIX.length()), Base64.NO_WRAP);
            if (payload.length <= IV_BYTES) return fallback;
            ByteBuffer input = ByteBuffer.wrap(payload);
            byte[] iv = new byte[IV_BYTES];
            input.get(iv);
            byte[] ciphertext = new byte[input.remaining()];
            input.get(ciphertext);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception error) {
            android.util.Log.e("AutamedicaVault", "Unable to decrypt vault entry", error);
            return fallback;
        }
    }

    static synchronized void delete(Context context, String name) throws Exception {
        validateName(name);
        prefs(context).edit().remove(name).commit();
    }

    static synchronized java.util.Set<String> names(Context context) {
        return new java.util.HashSet<>(prefs(context).getAll().keySet());
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void validateName(String name) {
        if (name == null || !name.matches("[A-Za-z0-9._-]{1,80}"))
            throw new IllegalArgumentException("Invalid vault key name");
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }
}
