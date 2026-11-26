package com.autamedica.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** AES-256-GCM vault with a non-exportable Android Keystore key and hot read cache. */
final class SecureVault {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "autamedica.companion.vault.aes.v1";
    private static final String PREFS = "companion_vault_ciphertext";
    private static final String PREFIX = "v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final ConcurrentHashMap<String, String> MEMORY_CACHE = new ConcurrentHashMap<>();
    private static volatile SecretKey cachedSecretKey;

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
        MEMORY_CACHE.put(name, value);
    }

    static String get(Context context, String name, String fallback) {
        if (name == null) return fallback;
        String cached = MEMORY_CACHE.get(name);
        if (cached != null) return cached;
        return getUncached(context, name, fallback);
    }

    private static synchronized String getUncached(Context context, String name, String fallback) {
        String cached = MEMORY_CACHE.get(name);
        if (cached != null) return cached;
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
            String plaintext = new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
            MEMORY_CACHE.put(name, plaintext);
            return plaintext;
        } catch (Exception error) {
            android.util.Log.e("AutamedicaVault", "Unable to decrypt vault entry", error);
            return fallback;
        }
    }

    static synchronized void delete(Context context, String name) throws Exception {
        validateName(name);
        prefs(context).edit().remove(name).commit();
        MEMORY_CACHE.remove(name);
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
        SecretKey existingCached = cachedSecretKey;
        if (existingCached != null) return existingCached;

        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(ALIAS, null);
        if (existing instanceof SecretKey) {
            cachedSecretKey = (SecretKey) existing;
            return cachedSecretKey;
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        cachedSecretKey = generator.generateKey();
        return cachedSecretKey;
    }
}
