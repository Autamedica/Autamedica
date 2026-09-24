package com.autamedica.android.presentation.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.AuthorType
import com.autamedica.android.domain.model.MedicalMessage
import com.autamedica.android.domain.model.MessageContentType
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary

@Composable
fun MessageBubble(
    message: MedicalMessage,
    isOwn: Boolean,
    modifier: Modifier = Modifier,
) {
    val alignment = if (isOwn) Alignment.End else Alignment.Start
    val bgColor = when {
        message.authorType == AuthorType.SYSTEM -> AuSurfaceHover
        isOwn -> AuAccent.copy(alpha = 0.18f)
        else -> AuSurfaceHover
    }
    val textColor = when {
        message.authorType == AuthorType.SYSTEM -> AuTextTertiary
        else -> AuTextPrimary
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = alignment,
    ) {
        // Sender name for other participant
        if (!isOwn && message.senderName != null && message.authorType != AuthorType.SYSTEM) {
            Text(
                text = message.senderName,
                color = AuTextTertiary,
                fontSize = 11.sp,
                modifier = Modifier.padding(start = 12.dp, bottom = 2.dp),
            )
        }

        // System messages render centered with different styling
        if (message.authorType == AuthorType.SYSTEM) {
            Text(
                text = message.content,
                modifier = Modifier
                    .padding(vertical = 4.dp)
                    .background(bgColor, RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                color = textColor,
                fontSize = 12.sp,
            )
        } else {
            Column(
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .background(bgColor, RoundedCornerShape(16.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                // Content type indicator for non-text
                if (message.contentType != MessageContentType.TEXT) {
                    val typeLabel = when (message.contentType) {
                        MessageContentType.IMAGE -> stringResource(R.string.chat_message_type_image)
                        MessageContentType.DOCUMENT -> stringResource(R.string.chat_message_type_document)
                        MessageContentType.AUDIO -> stringResource(R.string.chat_message_type_audio)
                        else -> ""
                    }
                    if (typeLabel.isNotEmpty()) {
                        Text(
                            text = typeLabel,
                            color = AuAccent,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                }

                Text(
                    text = message.content,
                    color = textColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )

                // Timestamp
                Text(
                    text = formatMessageTime(message.createdAt),
                    color = AuTextTertiary,
                    fontSize = 10.sp,
                    modifier = Modifier
                        .align(Alignment.End)
                        .padding(top = 4.dp),
                )
            }
        }
    }
}

private fun formatMessageTime(isoTimestamp: String): String {
    return try {
        isoTimestamp.substringAfter("T").take(5)
    } catch (_: Exception) {
        ""
    }
}
