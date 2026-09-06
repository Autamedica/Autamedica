package com.autamedica.android.presentation.prescriptions.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Native Jetpack Compose QR Code component for official pharmacy validation.
 * Encodes verification payload (e.g. CUIR or verification URL) into a high-contrast bitmap.
 */
@Composable
fun QrCodeView(
    content: String,
    modifier: Modifier = Modifier,
    size: Dp = 220.dp,
    backgroundColor: Color = Color.White,
    foregroundColor: Color = Color.Black,
    contentDescription: String = "Código QR de Validación Farmacéutica",
) {
    val density = LocalDensity.current
    val sizePx = remember(size, density) {
        with(density) { size.roundToPx() }.coerceAtLeast(120)
    }

    var qrBitmap by remember(content, sizePx) { mutableStateOf<Bitmap?>(null) }
    var isGenerating by remember(content) { mutableStateOf(true) }

    LaunchedEffect(content, sizePx) {
        if (content.isBlank()) {
            qrBitmap = null
            isGenerating = false
            return@LaunchedEffect
        }
        isGenerating = true
        qrBitmap = withContext(Dispatchers.Default) {
            generateQrCodeBitmap(
                content = content,
                width = sizePx,
                height = sizePx,
                fgColor = foregroundColor.toArgb(),
                bgColor = backgroundColor.toArgb(),
            )
        }
        isGenerating = false
    }

    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor),
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = qrBitmap
        if (bitmap != null && !isGenerating) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = contentDescription,
                modifier = Modifier.size(size),
            )
        } else if (isGenerating) {
            CircularProgressIndicator(
                modifier = Modifier.size(32.dp),
                color = MaterialTheme.colorScheme.primary,
                strokeWidth = 3.dp,
            )
        }
    }
}

/**
 * Encodes string data into a 2D QR Code Bitmap using ZXing QRCodeWriter.
 */
fun generateQrCodeBitmap(
    content: String,
    width: Int,
    height: Int,
    fgColor: Int = android.graphics.Color.BLACK,
    bgColor: Int = android.graphics.Color.WHITE,
): Bitmap? {
    return try {
        val hints = mapOf(
            EncodeHintType.CHARACTER_SET to "UTF-8",
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN to 1,
        )
        val bitMatrix = QRCodeWriter().encode(
            content,
            BarcodeFormat.QR_CODE,
            width,
            height,
            hints,
        )
        val matrixWidth = bitMatrix.width
        val matrixHeight = bitMatrix.height
        val pixels = IntArray(matrixWidth * matrixHeight)

        for (y in 0 until matrixHeight) {
            val offset = y * matrixWidth
            for (x in 0 until matrixWidth) {
                pixels[offset + x] = if (bitMatrix.get(x, y)) fgColor else bgColor
            }
        }

        Bitmap.createBitmap(matrixWidth, matrixHeight, Bitmap.Config.ARGB_8888).apply {
            setPixels(pixels, 0, matrixWidth, 0, 0, matrixWidth, matrixHeight)
        }
    } catch (_: Exception) {
        null
    }
}
