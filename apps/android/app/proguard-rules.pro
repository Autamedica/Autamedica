# ── WebRTC ──
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# ── Kotlin Serialization ──
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.autamedica.android.**$$serializer { *; }
-keepclassmembers class com.autamedica.android.** {
    *** Companion;
}
-keepclasseswithmembers class com.autamedica.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep @SerialName annotated fields
-keepclassmembers @kotlinx.serialization.Serializable class com.autamedica.android.** {
    <fields>;
    <init>(...);
}

# ── OkHttp ──
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-keep class okhttp3.internal.publicsuffix.PublicSuffixDatabase { *; }

# ── Supabase ──
-keep class io.github.jan.supabase.** { *; }
-dontwarn io.github.jan.supabase.**

# ── Ktor ──
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# ── Coroutines ──
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# ── Google Credential Manager / Sign-In ──
-keep class com.google.android.libraries.identity.** { *; }
-keep class androidx.credentials.** { *; }
-dontwarn com.google.android.libraries.identity.**

# ── Coil ──
-dontwarn coil3.**

# ── Hilt / Dagger ──
-keepclasseswithmembers class * {
    @dagger.* <methods>;
}
-keepclasseswithmembers class * {
    @javax.inject.* <fields>;
    @javax.inject.* <methods>;
}

# ── R8 full mode ──
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepattributes SourceFile,LineNumberTable

# ── Enums ──
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
