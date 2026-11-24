package com.autamedica.android.presentation.profile

import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.autamedica.android.R

private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024
private val ALLOWED_AVATAR_MIMES = setOf("image/jpeg", "image/png", "image/webp")

@Composable
internal fun rememberAvatarPickerLauncher(
    onPicked: (bytes: ByteArray, mimeType: String) -> Unit,
    onError: (String) -> Unit,
): () -> Unit {
    val context = LocalContext.current
    val tooLargeMsg = stringResource(R.string.profile_avatar_too_large)
    val invalidTypeMsg = stringResource(R.string.profile_avatar_invalid_type)

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val resolver = context.contentResolver
        val rawMime = resolver.getType(uri)?.trim()?.lowercase()?.substringBefore(';')?.trim()
            ?: MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(uri.toString()).lowercase())
                ?.lowercase()
        val mimeType = if (rawMime == "image/jpg") "image/jpeg" else rawMime

        if (mimeType == null || mimeType !in ALLOWED_AVATAR_MIMES) {
            onError(invalidTypeMsg)
            return@rememberLauncherForActivityResult
        }

        val bytes = runCatching {
            resolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()

        if (bytes == null || bytes.isEmpty()) {
            onError(invalidTypeMsg)
            return@rememberLauncherForActivityResult
        }
        if (bytes.size > MAX_AVATAR_BYTES) {
            onError(tooLargeMsg)
            return@rememberLauncherForActivityResult
        }

        onPicked(bytes, mimeType)
    }

    return { launcher.launch("image/*") }
}

@Composable
internal fun ProfileAvatarBadge(
    avatarUrl: String?,
    initials: String,
    accentColor: Color,
    isUploading: Boolean,
    size: Dp,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clickable(enabled = !isUploading, onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .background(accentColor),
            contentAlignment = Alignment.Center,
        ) {
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = contentDescription,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(
                    text = initials,
                    color = Color.White,
                    fontSize = (size.value * 0.36f).sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            if (isUploading) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.45f)),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                }
            }
        }

        Surface(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(22.dp)
                .border(1.5.dp, Color.White, CircleShape),
            shape = CircleShape,
            color = Color(0xFF0F172A),
            border = BorderStroke(1.dp, Color.White),
        ) {
            Icon(
                imageVector = Icons.Outlined.CameraAlt,
                contentDescription = contentDescription,
                tint = Color.White,
                modifier = Modifier.padding(4.dp),
            )
        }
    }
}
