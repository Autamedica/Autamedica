package com.autamedica.android.presentation.common

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.LruCache
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import com.autamedica.android.R
import com.autamedica.android.data.repository.DownloadedInAppDocument
import com.autamedica.android.data.repository.InAppDocumentDownloader
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.PortalPatients
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

sealed interface DocumentViewerSource {
    val title: String
    val fileName: String

    data class LocalPdfFile(
        val filePath: String,
        override val title: String,
        override val fileName: String = "documento.pdf",
    ) : DocumentViewerSource

    data class RemoteDocumentUrl(
        val url: String,
        override val title: String,
        override val fileName: String = "documento.pdf",
        val isImageHint: Boolean = false,
    ) : DocumentViewerSource
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface InAppDocumentViewerEntryPoint {
    fun documentDownloader(): InAppDocumentDownloader
}

private sealed interface ViewerLoadState {
    data object Loading : ViewerLoadState
    data class Ready(val document: DownloadedInAppDocument) : ViewerLoadState
    data object Error : ViewerLoadState
}

/**
 * Full-screen native Jetpack Compose PDF & clinical image viewer.
 * Keeps prescriptions, certificates, medical orders, and clinical studies strictly inside
 * AutaMedica without launching Chrome or external apps unless the user explicitly taps Share.
 */
@Composable
fun InAppDocumentViewerDialog(
    source: DocumentViewerSource,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val downloader = remember(context.applicationContext) {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            InAppDocumentViewerEntryPoint::class.java,
        ).documentDownloader()
    }

    var retryNonce by remember { mutableIntStateOf(0) }
    var loadState by remember(source) { mutableStateOf<ViewerLoadState>(ViewerLoadState.Loading) }
    var zoomScale by remember(source) { mutableFloatStateOf(1f) }
    var panOffset by remember(source) { mutableStateOf(Offset.Zero) }
    var currentPage by remember(source) { mutableIntStateOf(1) }
    var totalPages by remember(source) { mutableIntStateOf(0) }
    var isSaving by remember { mutableStateOf(false) }

    LaunchedEffect(source, retryNonce) {
        loadState = ViewerLoadState.Loading
        zoomScale = 1f
        panOffset = Offset.Zero
        currentPage = 1
        totalPages = 0
        loadState = when (source) {
            is DocumentViewerSource.LocalPdfFile -> {
                val file = File(source.filePath)
                if (file.isFile && file.length() > 0L) {
                    ViewerLoadState.Ready(
                        DownloadedInAppDocument(
                            file = file,
                            mimeType = "application/pdf",
                            isPdf = true,
                            isImage = false,
                        )
                    )
                } else {
                    ViewerLoadState.Error
                }
            }
            is DocumentViewerSource.RemoteDocumentUrl -> {
                downloader.downloadToPrivateCache(source.url, source.isImageHint)
                    .fold(
                        onSuccess = { ViewerLoadState.Ready(it) },
                        onFailure = { err ->
                            if (err is CancellationException) throw err
                            ViewerLoadState.Error
                        },
                    )
            }
        }
    }

    val savedToast = stringResource(R.string.doc_viewer_saved_downloads)
    val saveErrorToast = stringResource(R.string.doc_viewer_save_error)
    val shareChooserTitle = stringResource(R.string.doc_viewer_share_chooser)
    val shareErrorToast = stringResource(R.string.doc_viewer_share_error)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        val readyDoc = (loadState as? ViewerLoadState.Ready)?.document

        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color(0xFF0F172A),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top bar with proper status-bar inset handling (edge-to-edge safe)
                Surface(
                    color = Color(0xFF111827),
                    shadowElevation = 4.dp,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .statusBarsPadding()
                            .padding(horizontal = 8.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.doc_viewer_close),
                                tint = Color.White,
                            )
                        }
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 4.dp),
                        ) {
                            Text(
                                text = source.title.ifBlank { stringResource(R.string.doc_viewer_default_title) },
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            val subtitle = when {
                                readyDoc?.isPdf == true && totalPages > 0 ->
                                    stringResource(R.string.doc_viewer_page_indicator, currentPage, totalPages)
                                readyDoc?.isImage == true ->
                                    stringResource(R.string.doc_viewer_image_badge)
                                else ->
                                    stringResource(R.string.doc_viewer_secure_badge)
                            }
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF94A3B8),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }

                        if (readyDoc != null) {
                            IconButton(
                                enabled = !isSaving,
                                onClick = {
                                    isSaving = true
                                    scope.launch {
                                        val ok = saveDocumentToDownloads(
                                            context = context,
                                            sourceFile = readyDoc.file,
                                            displayName = sanitizeDownloadName(source.fileName, readyDoc.mimeType),
                                            mimeType = readyDoc.mimeType,
                                        )
                                        isSaving = false
                                        Toast.makeText(
                                            context,
                                            if (ok) savedToast else saveErrorToast,
                                            Toast.LENGTH_SHORT,
                                        ).show()
                                    }
                                },
                            ) {
                                if (isSaving) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(18.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp,
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Outlined.Download,
                                        contentDescription = stringResource(R.string.doc_viewer_download),
                                        tint = Color.White,
                                    )
                                }
                            }

                            IconButton(
                                onClick = {
                                    val shared = shareDocumentFile(
                                        context = context,
                                        file = readyDoc.file,
                                        mimeType = readyDoc.mimeType,
                                        chooserTitle = shareChooserTitle,
                                    )
                                    if (!shared) {
                                        Toast.makeText(context, shareErrorToast, Toast.LENGTH_SHORT).show()
                                    }
                                },
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Share,
                                    contentDescription = stringResource(R.string.doc_viewer_share),
                                    tint = Color.White,
                                )
                            }
                        }
                    }
                }

                // Document canvas
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A)),
                ) {
                    when (val state = loadState) {
                        ViewerLoadState.Loading -> {
                            Column(
                                modifier = Modifier
                                    .align(Alignment.Center)
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                CircularProgressIndicator(color = PortalPatients, strokeWidth = 3.dp)
                                Text(
                                    text = stringResource(R.string.doc_viewer_loading),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color(0xFFCBD5E1),
                                )
                            }
                        }

                        ViewerLoadState.Error -> {
                            Column(
                                modifier = Modifier
                                    .align(Alignment.Center)
                                    .padding(32.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = AuDanger.copy(alpha = 0.16f),
                                    modifier = Modifier.size(64.dp),
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Outlined.ErrorOutline,
                                            contentDescription = null,
                                            tint = AuDanger,
                                            modifier = Modifier.size(32.dp),
                                        )
                                    }
                                }
                                Text(
                                    text = stringResource(R.string.doc_viewer_error_title),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    textAlign = TextAlign.Center,
                                )
                                Text(
                                    text = stringResource(R.string.doc_viewer_error_desc),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(0xFF94A3B8),
                                    textAlign = TextAlign.Center,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Button(
                                    onClick = { retryNonce++ },
                                    colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                                    shape = RoundedCornerShape(10.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.Refresh,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(stringResource(R.string.doc_viewer_retry), fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }

                        is ViewerLoadState.Ready -> {
                            if (state.document.isPdf) {
                                NativePdfRendererCanvas(
                                    file = state.document.file,
                                    zoomScale = zoomScale,
                                    panOffset = panOffset,
                                    onZoomChange = { newScale, newOffset ->
                                        zoomScale = newScale
                                        panOffset = newOffset
                                    },
                                    onPageChanged = { page, count ->
                                        currentPage = page
                                        totalPages = count
                                    },
                                    onRenderError = { loadState = ViewerLoadState.Error },
                                )
                            } else {
                                NativeImageViewerCanvas(
                                    file = state.document.file,
                                    zoomScale = zoomScale,
                                    panOffset = panOffset,
                                    onZoomChange = { newScale, newOffset ->
                                        zoomScale = newScale
                                        panOffset = newOffset
                                    },
                                    onRenderError = { loadState = ViewerLoadState.Error },
                                )
                            }

                            // Floating bottom controls (zoom & page counter)
                            Surface(
                                color = Color(0xE6111827),
                                shape = RoundedCornerShape(24.dp),
                                shadowElevation = 8.dp,
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .navigationBarsPadding()
                                    .padding(bottom = 16.dp),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    IconButton(
                                        onClick = {
                                            val next = (zoomScale - 0.5f).coerceAtLeast(1f)
                                            zoomScale = next
                                            if (next <= 1.01f) panOffset = Offset.Zero
                                        },
                                        enabled = zoomScale > 1.01f,
                                        modifier = Modifier.size(36.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.ZoomOut,
                                            contentDescription = stringResource(R.string.doc_viewer_zoom_out),
                                            tint = if (zoomScale > 1.01f) Color.White else Color(0xFF475569),
                                            modifier = Modifier.size(20.dp),
                                        )
                                    }

                                    Text(
                                        text = "${(zoomScale * 100).toInt()}%",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = Color.White,
                                        fontWeight = FontWeight.SemiBold,
                                    )

                                    IconButton(
                                        onClick = {
                                            zoomScale = (zoomScale + 0.5f).coerceAtMost(4f)
                                        },
                                        enabled = zoomScale < 3.99f,
                                        modifier = Modifier.size(36.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.ZoomIn,
                                            contentDescription = stringResource(R.string.doc_viewer_zoom_in),
                                            tint = if (zoomScale < 3.99f) Color.White else Color(0xFF475569),
                                            modifier = Modifier.size(20.dp),
                                        )
                                    }

                                    if (state.document.isPdf && totalPages > 0) {
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Surface(
                                            color = PortalPatients.copy(alpha = 0.22f),
                                            shape = RoundedCornerShape(12.dp),
                                        ) {
                                            Text(
                                                text = "$currentPage / $totalPages",
                                                style = MaterialTheme.typography.labelMedium,
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private class ManagedPdfDocument(
    val pfd: ParcelFileDescriptor,
    val renderer: PdfRenderer,
    val pageAspectRatios: List<Float>,
    val mutex: Mutex = Mutex(),
) {
    val pageCount: Int get() = renderer.pageCount

    fun close() {
        runCatching { renderer.close() }
        runCatching { pfd.close() }
    }
}

@Composable
private fun NativePdfRendererCanvas(
    file: File,
    zoomScale: Float,
    panOffset: Offset,
    onZoomChange: (Float, Offset) -> Unit,
    onPageChanged: (currentPage: Int, totalPages: Int) -> Unit,
    onRenderError: () -> Unit,
) {
    val density = LocalDensity.current
    val screenWidthPx = with(density) { LocalConfiguration.current.screenWidthDp.dp.roundToPx() }
    val targetRenderWidthPx = remember(screenWidthPx) {
        (screenWidthPx * 2).coerceIn(720, 1600)
    }

    var pdfDoc by remember(file.absolutePath) { mutableStateOf<ManagedPdfDocument?>(null) }
    val bitmapCache = remember(file.absolutePath) {
        object : LruCache<Int, Bitmap>(6) {}
    }

    LaunchedEffect(file.absolutePath) {
        val opened = withContext(Dispatchers.IO) {
            runCatching {
                val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)
                val ratios = (0 until renderer.pageCount).map { idx ->
                    renderer.openPage(idx).use { page ->
                        val h = page.height.coerceAtLeast(1)
                        (page.width.toFloat() / h.toFloat()).coerceIn(0.4f, 2.5f)
                    }
                }
                ManagedPdfDocument(pfd = pfd, renderer = renderer, pageAspectRatios = ratios)
            }.getOrNull()
        }
        if (opened == null || opened.pageCount <= 0) {
            opened?.close()
            onRenderError()
        } else {
            pdfDoc = opened
            onPageChanged(1, opened.pageCount)
        }
    }

    DisposableEffect(file.absolutePath) {
        onDispose {
            bitmapCache.evictAll()
            pdfDoc?.close()
            pdfDoc = null
        }
    }

    val activeDoc = pdfDoc
    if (activeDoc == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = PortalPatients, strokeWidth = 3.dp)
        }
        return
    }

    val listState = rememberLazyListState()
    val visiblePage by remember(activeDoc.pageCount) {
        derivedStateOf {
            (listState.firstVisibleItemIndex + 1).coerceIn(1, activeDoc.pageCount)
        }
    }
    LaunchedEffect(visiblePage, activeDoc.pageCount) {
        onPageChanged(visiblePage, activeDoc.pageCount)
    }

    val gestureModifier = Modifier
        .fillMaxSize()
        .pointerInput(zoomScale) {
            detectTapGestures(
                onDoubleTap = {
                    if (zoomScale > 1.05f) {
                        onZoomChange(1f, Offset.Zero)
                    } else {
                        onZoomChange(2.2f, Offset.Zero)
                    }
                }
            )
        }
        .then(
            if (zoomScale > 1.01f) {
                Modifier.pointerInput(zoomScale, panOffset) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val nextScale = (zoomScale * zoom).coerceIn(1f, 4f)
                        val maxX = (size.width * (nextScale - 1f)) / 2f
                        val maxY = (size.height * (nextScale - 1f)) / 2f
                        val nextOffset = if (nextScale <= 1.01f) {
                            Offset.Zero
                        } else {
                            Offset(
                                x = (panOffset.x + pan.x).coerceIn(-maxX, maxX),
                                y = (panOffset.y + pan.y).coerceIn(-maxY, maxY),
                            )
                        }
                        onZoomChange(nextScale, nextOffset)
                    }
                }
            } else {
                Modifier
            }
        )

    Box(modifier = gestureModifier) {
        LazyColumn(
            state = listState,
            userScrollEnabled = zoomScale <= 1.05f,
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 84.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = zoomScale
                    scaleY = zoomScale
                    translationX = panOffset.x
                    translationY = panOffset.y
                },
        ) {
            items(
                count = activeDoc.pageCount,
                key = { it },
            ) { pageIndex ->
                val aspectRatio = activeDoc.pageAspectRatios.getOrElse(pageIndex) { 0.707f }
                PdfPageCard(
                    doc = activeDoc,
                    pageIndex = pageIndex,
                    aspectRatio = aspectRatio,
                    targetWidthPx = targetRenderWidthPx,
                    cache = bitmapCache,
                )
            }
        }
    }
}

@Composable
private fun PdfPageCard(
    doc: ManagedPdfDocument,
    pageIndex: Int,
    aspectRatio: Float,
    targetWidthPx: Int,
    cache: LruCache<Int, Bitmap>,
) {
    var bitmap by remember(doc, pageIndex) { mutableStateOf(cache.get(pageIndex)) }

    LaunchedEffect(doc, pageIndex) {
        if (bitmap != null) return@LaunchedEffect
        val rendered = withContext(Dispatchers.IO) {
            doc.mutex.withLock {
                cache.get(pageIndex)?.let { return@withLock it }
                runCatching {
                    doc.renderer.openPage(pageIndex).use { page ->
                        val scale = targetWidthPx.toFloat() / page.width.coerceAtLeast(1).toFloat()
                        val width = targetWidthPx
                        val height = (page.height * scale).toInt().coerceIn(1, 3200)
                        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        val canvas = Canvas(bmp)
                        canvas.drawColor(AndroidColor.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        cache.put(pageIndex, bmp)
                        bmp
                    }
                }.getOrNull()
            }
        }
        bitmap = rendered
    }

    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Color.White,
        shadowElevation = 4.dp,
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(aspectRatio)
            .clip(RoundedCornerShape(10.dp)),
    ) {
        val bmp = bitmap
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = stringResource(R.string.doc_viewer_page_cd, pageIndex + 1),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(AuSurface),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    color = PortalPatients,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(28.dp),
                )
            }
        }
    }
}

@Composable
private fun NativeImageViewerCanvas(
    file: File,
    zoomScale: Float,
    panOffset: Offset,
    onZoomChange: (Float, Offset) -> Unit,
    onRenderError: () -> Unit,
) {
    var bitmap by remember(file.absolutePath) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(file.absolutePath) {
        val decoded = withContext(Dispatchers.IO) {
            runCatching {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.absolutePath, bounds)
                var sample = 1
                while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) {
                    sample *= 2
                }
                val opts = BitmapFactory.Options().apply { inSampleSize = sample }
                BitmapFactory.decodeFile(file.absolutePath, opts)
            }.getOrNull()
        }
        if (decoded == null) {
            onRenderError()
        } else {
            bitmap = decoded
        }
    }

    val bmp = bitmap
    if (bmp == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = PortalPatients, strokeWidth = 3.dp)
        }
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(zoomScale) {
                detectTapGestures(
                    onDoubleTap = {
                        if (zoomScale > 1.05f) onZoomChange(1f, Offset.Zero)
                        else onZoomChange(2.5f, Offset.Zero)
                    }
                )
            }
            .pointerInput(zoomScale, panOffset) {
                detectTransformGestures { _, pan, zoom, _ ->
                    val nextScale = (zoomScale * zoom).coerceIn(1f, 4f)
                    val maxX = (size.width * (nextScale - 1f)) / 2f
                    val maxY = (size.height * (nextScale - 1f)) / 2f
                    val nextOffset = if (nextScale <= 1.01f) {
                        Offset.Zero
                    } else {
                        Offset(
                            x = (panOffset.x + pan.x).coerceIn(-maxX, maxX),
                            y = (panOffset.y + pan.y).coerceIn(-maxY, maxY),
                        )
                    }
                    onZoomChange(nextScale, nextOffset)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = bmp.asImageBitmap(),
            contentDescription = stringResource(R.string.doc_viewer_image_badge),
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp)
                .graphicsLayer {
                    scaleX = zoomScale
                    scaleY = zoomScale
                    translationX = panOffset.x
                    translationY = panOffset.y
                },
        )
    }
}

private fun sanitizeDownloadName(rawName: String, mimeType: String): String {
    val ext = when (mimeType) {
        "application/pdf" -> ".pdf"
        "image/png" -> ".png"
        "image/webp" -> ".webp"
        else -> ".jpg"
    }
    val base = rawName.trim()
        .substringBeforeLast('.')
        .replace(Regex("[^A-Za-z0-9._-]"), "_")
        .take(64)
        .ifBlank { "AutaMedica_Documento_${System.currentTimeMillis()}" }
    return "$base$ext"
}

private suspend fun saveDocumentToDownloads(
    context: Context,
    sourceFile: File,
    displayName: String,
    mimeType: String,
): Boolean = withContext(Dispatchers.IO) {
    runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, displayName)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/AutaMedica")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return@runCatching false
            resolver.openOutputStream(uri)?.use { out ->
                sourceFile.inputStream().use { input -> input.copyTo(out) }
            } ?: return@runCatching false
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        } else {
            @Suppress("DEPRECATION")
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val appDir = File(downloadsDir, "AutaMedica").apply { mkdirs() }
            val dest = File(appDir, displayName)
            sourceFile.copyTo(dest, overwrite = true)
            true
        }
    }.onFailure { err ->
        SecureLog.error("[InAppDocumentViewer] Failed saving document to Downloads", err)
    }.getOrDefault(false)
}

private fun shareDocumentFile(
    context: Context,
    file: File,
    mimeType: String,
    chooserTitle: String,
): Boolean = runCatching {
    val contentUri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(shareIntent, chooserTitle).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(chooser)
    true
}.onFailure { err ->
    SecureLog.error("[InAppDocumentViewer] Failed sharing document", err)
}.getOrDefault(false)
