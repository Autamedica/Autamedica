package com.autamedica.android.presentation.documents

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.outlined.Biotech
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.ClinicalDocument
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PortalPatientsSoft
import com.autamedica.android.presentation.theme.SuccessContainer

private data class SelectedFileInfo(
    val uri: Uri,
    val fileName: String,
    val mimeType: String,
    val fileSize: Long,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicalDocumentsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ClinicalDocumentsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    var selectedFileForUpload by remember { mutableStateOf<SelectedFileInfo?>(null) }
    var showUploadModal by remember { mutableStateOf(false) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri != null) {
            val contentResolver = context.contentResolver
            var name = "estudio_${System.currentTimeMillis()}"
            var size = 0L

            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (cursor.moveToFirst()) {
                    if (nameIndex != -1) name = cursor.getString(nameIndex) ?: name
                    if (sizeIndex != -1) size = cursor.getLong(sizeIndex)
                }
            }

            val mime = contentResolver.getType(uri) ?: when {
                name.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                name.endsWith(".png", ignoreCase = true) -> "image/png"
                name.endsWith(".webp", ignoreCase = true) -> "image/webp"
                else -> "image/jpeg"
            }

            selectedFileForUpload = SelectedFileInfo(
                uri = uri,
                fileName = name,
                mimeType = mime,
                fileSize = size,
            )
            showUploadModal = true
        }
    }

    val uploadSuccessMsg = stringResource(R.string.clinical_docs_upload_success)
    LaunchedEffect(uiState.uploadSuccessMessage) {
        uiState.uploadSuccessMessage?.let {
            snackbarHostState.showSnackbar(uploadSuccessMsg)
            viewModel.dismissSuccessMessage()
            showUploadModal = false
            selectedFileForUpload = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.clinical_docs_title),
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = stringResource(R.string.clinical_docs_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.clinical_docs_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(
                            imageVector = Icons.Outlined.Refresh,
                            contentDescription = stringResource(R.string.clinical_docs_refresh),
                            tint = AuTextSecondary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    filePickerLauncher.launch("*/*")
                },
                containerColor = PortalPatients,
                contentColor = Color.White,
                icon = {
                    Icon(
                        imageVector = Icons.Filled.CloudUpload,
                        contentDescription = null,
                    )
                },
                text = {
                    Text(
                        text = stringResource(R.string.clinical_docs_fab_upload),
                        fontWeight = FontWeight.Bold,
                    )
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                uiState.isLoading && uiState.documents.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            color = PortalPatients,
                            strokeWidth = 3.dp,
                        )
                    }
                }

                uiState.error != null && uiState.documents.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Description,
                                contentDescription = null,
                                tint = AuDanger,
                                modifier = Modifier.size(54.dp),
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = stringResource(R.string.clinical_docs_error_loading),
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = uiState.error ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = viewModel::loadDocuments,
                                colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                            ) {
                                Text(stringResource(R.string.clinical_docs_retry))
                            }
                        }
                    }
                }

                uiState.documents.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = PortalPatientsSoft,
                                modifier = Modifier.size(72.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Outlined.UploadFile,
                                        contentDescription = null,
                                        tint = PortalPatients,
                                        modifier = Modifier.size(36.dp),
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = stringResource(R.string.clinical_docs_empty_title),
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = stringResource(R.string.clinical_docs_empty_desc),
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(modifier = Modifier.height(20.dp))
                            Button(
                                onClick = { filePickerLauncher.launch("*/*") },
                                colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Add,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(stringResource(R.string.clinical_docs_select_file))
                            }
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(
                            items = uiState.documents,
                            key = { it.id },
                        ) { doc ->
                            ClinicalDocumentCard(
                                document = doc,
                                onOpen = {
                                    if (doc.fileUrl.isNotBlank()) {
                                        runCatching {
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(doc.fileUrl))
                                            context.startActivity(intent)
                                        }.onFailure {
                                            Toast.makeText(context, context.getString(R.string.clinical_docs_toast_open_error), Toast.LENGTH_SHORT).show()
                                        }
                                    } else {
                                        Toast.makeText(context, context.getString(R.string.clinical_docs_toast_processing), Toast.LENGTH_SHORT).show()
                                    }
                                },
                            )
                        }
                        // Spacer for Extended FAB visibility
                        item { Spacer(modifier = Modifier.height(72.dp)) }
                    }
                }
            }
        }
    }

    // Modal para ingresar título y tipo antes de subir
    if (showUploadModal && selectedFileForUpload != null) {
        val fileInfo = selectedFileForUpload!!
        UploadDocumentDialog(
            fileInfo = fileInfo,
            isUploading = uiState.isUploading,
            errorMessage = uiState.error,
            onDismiss = {
                if (!uiState.isUploading) {
                    showUploadModal = false
                    selectedFileForUpload = null
                    viewModel.clearError()
                }
            },
            onConfirm = { title, type ->
                val stream = context.contentResolver.openInputStream(fileInfo.uri)
                if (stream != null) {
                    viewModel.uploadDocument(
                        title = title,
                        type = type,
                        fileName = fileInfo.fileName,
                        mimeType = fileInfo.mimeType,
                        inputStream = stream,
                    )
                } else {
                    Toast.makeText(context, context.getString(R.string.clinical_docs_toast_read_error), Toast.LENGTH_SHORT).show()
                }
            },
        )
    }
}

@Composable
private fun ClinicalDocumentCard(
    document: ClinicalDocument,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onOpen,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Document type icon
            val (icon, iconColor, iconBg) = when {
                document.isPdf -> Triple(Icons.Outlined.PictureAsPdf, AuDanger, Color(0xFFFEE2E2))
                document.isImage -> Triple(Icons.Outlined.Image, PortalPatients, PortalPatientsSoft)
                document.type == "lab_result" -> Triple(Icons.Outlined.Biotech, AuSuccess, SuccessContainer)
                else -> Triple(Icons.Outlined.Description, PortalPatients, PortalPatientsSoft)
            }

            Surface(
                shape = RoundedCornerShape(10.dp),
                color = iconBg,
                modifier = Modifier.size(46.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconColor,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = document.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = formatDocumentType(document.type),
                        style = MaterialTheme.typography.bodySmall,
                        color = PortalPatients,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (document.formattedFileSize.isNotBlank()) {
                        Text(
                            text = "•",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                        Text(
                            text = document.formattedFileSize,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
                }
                if (document.dateRecorded.isNotBlank()) {
                    Text(
                        text = document.dateRecorded.take(10),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                }
            }

            IconButton(onClick = onOpen) {
                Icon(
                    imageVector = Icons.Outlined.OpenInNew,
                    contentDescription = stringResource(R.string.clinical_docs_open),
                    tint = PortalPatients,
                )
            }
        }
    }
}

@Composable
private fun formatDocumentType(type: String): String {
    return when (type.lowercase()) {
        "lab_result", "laboratorio" -> stringResource(R.string.clinical_docs_type_lab)
        "imaging", "imagen", "imagenologia" -> stringResource(R.string.clinical_docs_type_imaging)
        else -> stringResource(R.string.clinical_docs_type_other)
    }
}

@Composable
private fun UploadDocumentDialog(
    fileInfo: SelectedFileInfo,
    isUploading: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onConfirm: (title: String, type: String) -> Unit,
) {
    var title by remember { mutableStateOf(fileInfo.fileName.substringBeforeLast(".")) }
    var selectedType by remember { mutableStateOf("lab_result") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = stringResource(R.string.clinical_docs_dialog_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // File info chip
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AuSurfaceHover,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = if (fileInfo.mimeType.contains("pdf")) Icons.Outlined.PictureAsPdf else Icons.Outlined.Image,
                            contentDescription = null,
                            tint = PortalPatients,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = fileInfo.fileName,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = AuTextPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (fileInfo.fileSize > 0) {
                                val sizeText = if (fileInfo.fileSize < 1024 * 1024) {
                                    "${fileInfo.fileSize / 1024} KB"
                                } else {
                                    "${fileInfo.fileSize / (1024 * 1024)} MB"
                                }
                                Text(
                                    text = sizeText,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AuTextTertiary,
                                )
                            }
                        }
                    }
                }

                // Title input
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.clinical_docs_input_title_label)) },
                    placeholder = { Text(stringResource(R.string.clinical_docs_input_title_placeholder)) },
                    singleLine = true,
                    enabled = !isUploading,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PortalPatients,
                        focusedLabelColor = PortalPatients,
                    ),
                )

                // Study type selector
                Text(
                    text = stringResource(R.string.clinical_docs_type_selector_label),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = AuTextSecondary,
                )

                val types = listOf(
                    "lab_result" to stringResource(R.string.clinical_docs_chip_lab),
                    "imaging" to stringResource(R.string.clinical_docs_chip_imaging),
                    "document" to stringResource(R.string.clinical_docs_chip_document),
                )

                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(types) { (key, label) ->
                        FilterChip(
                            selected = selectedType == key,
                            onClick = { if (!isUploading) selectedType = key },
                            label = { Text(label) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PortalPatientsSoft,
                                selectedLabelColor = PortalPatients,
                            ),
                        )
                    }
                }

                if (isUploading) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = PortalPatients,
                            strokeWidth = 2.5.dp,
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.clinical_docs_uploading),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }

                if (errorMessage != null && !isUploading) {
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuDanger,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(title.ifBlank { fileInfo.fileName }, selectedType) },
                enabled = !isUploading && title.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
            ) {
                Text(stringResource(R.string.clinical_docs_confirm_upload))
            }
        },
        dismissButton = {
            if (!isUploading) {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.clinical_docs_cancel), color = AuTextSecondary)
                }
            }
        },
        containerColor = AuSurface,
    )
}
