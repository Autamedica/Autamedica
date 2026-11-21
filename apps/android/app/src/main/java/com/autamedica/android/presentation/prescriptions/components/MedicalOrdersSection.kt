package com.autamedica.android.presentation.prescriptions.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Biotech
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.presentation.prescriptions.isConfirmedOrder
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.PrimaryContainer
import com.autamedica.android.presentation.theme.SuccessContainer
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
fun MedicalOrdersContentView(
    orders: List<MedicalOrder>,
    isLoading: Boolean,
    error: String?,
    onSelectOrder: (MedicalOrder) -> Unit,
    onOpenPdf: (MedicalOrder) -> Unit,
    onRequestConsultation: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when {
        isLoading && orders.isEmpty() -> {
            Box(modifier = modifier, contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PortalPatientsAction, strokeWidth = 2.5.dp)
            }
        }

        error != null && orders.isEmpty() -> {
            Box(
                modifier = modifier.padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Biotech,
                        contentDescription = null,
                        tint = AuDanger,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        text = stringResource(R.string.docs_orders_error_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Button(
                        onClick = onRetry,
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PortalPatientsAction,
                            contentColor = Color.White,
                        ),
                    ) {
                        Text(stringResource(R.string.prescriptions_retry))
                    }
                }
            }
        }

        orders.isEmpty() -> {
            Box(
                modifier = modifier.padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(PrimaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Biotech,
                            contentDescription = null,
                            tint = PortalPatientsAction,
                            modifier = Modifier.size(30.dp),
                        )
                    }
                    Text(
                        text = stringResource(R.string.docs_orders_empty_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = stringResource(R.string.docs_orders_empty_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Button(
                        onClick = onRequestConsultation,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PortalPatientsAction,
                            contentColor = Color.White,
                        ),
                    ) {
                        Text(
                            text = stringResource(R.string.docs_orders_empty_cta),
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        else -> {
            LazyColumn(
                modifier = modifier,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(orders, key = { it.id }) { order ->
                    MedicalOrderCard(
                        order = order,
                        onClick = { onSelectOrder(order) },
                        onOpenPdf = onOpenPdf,
                    )
                }
            }
        }
    }
}

@Composable
private fun MedicalOrderCard(
    order: MedicalOrder,
    onClick: () -> Unit,
    onOpenPdf: (MedicalOrder) -> Unit,
) {
    val canDownloadPdf = order.isConfirmedOrder()
    val practicesSummary = order.practices
        .mapNotNull { it.name.takeIf(String::isNotBlank) }
        .joinToString(" · ")
    val formattedDate = formatOrderDate(order.createdAt)

    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = order.studyType.localizedTitle(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(8.dp))
                MedicalOrderStatusBadge(order = order)
            }

            if (practicesSummary.isNotBlank()) {
                Text(
                    text = practicesSummary,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = AuTextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            } else if (!order.diagnosis.isNullOrBlank()) {
                Text(
                    text = order.diagnosis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Text(
                text = "${order.doctorName ?: stringResource(R.string.prescriptions_default_doctor)} · $formattedDate",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(modifier = Modifier.height(2.dp))

            // Action strip: verification code + AutaMedica Sky PDF button
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = Color(0xFFF8FAFC),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.QrCode,
                            contentDescription = null,
                            tint = PortalPatientsAction,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = order.cuir?.takeIf { it.isNotBlank() }?.let { "CUIR · ${it.takeLast(8)}" }
                                ?: stringResource(R.string.docs_order_view_detail),
                            style = MaterialTheme.typography.labelMedium,
                            fontFamily = if (!order.cuir.isNullOrBlank()) FontFamily.Monospace else FontFamily.Default,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    if (canDownloadPdf) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = PrimaryContainer,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { onOpenPdf(order) },
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.PictureAsPdf,
                                    contentDescription = stringResource(R.string.prescriptions_download_pdf_cd),
                                    tint = PortalPatientsAction,
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    text = stringResource(R.string.prescriptions_pdf_badge),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = PortalPatientsAction,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MedicalOrderStatusBadge(order: MedicalOrder) {
    val normalized = order.status.lowercase()
    val (bg, fg, labelRes) = when {
        order.isConfirmedOrder() -> Triple(SuccessContainer, Color(0xFF15803D), R.string.docs_order_status_issued)
        normalized in setOf("cancelled", "canceled", "anulada", "revoked") -> Triple(ErrorContainer, AuDanger, R.string.docs_order_status_cancelled)
        else -> Triple(PrimaryContainer, PortalPatientsAction, R.string.docs_order_status_pending)
    }

    Surface(
        shape = CircleShape,
        color = bg,
    ) {
        Text(
            text = stringResource(labelRes),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = fg,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedicalOrderDetailBottomSheet(
    order: MedicalOrder,
    onDismiss: () -> Unit,
    onOpenPdf: (MedicalOrder) -> Unit,
    onCopyCuir: (cuir: String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val canDownloadPdf = order.isConfirmedOrder()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = order.studyType.localizedTitle(),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    modifier = Modifier.weight(1f),
                )
                MedicalOrderStatusBadge(order = order)
            }

            if (order.practices.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = stringResource(R.string.docs_order_practices_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = AuTextTertiary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    order.practices.forEach { practice ->
                        val codePart = practice.code?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
                        Text(
                            text = "• ${practice.name}$codePart",
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextPrimary,
                        )
                    }
                }
            }

            order.diagnosis?.takeIf { it.isNotBlank() }?.let { diag ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = stringResource(R.string.docs_order_diagnosis_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = AuTextTertiary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = diag,
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextPrimary,
                    )
                }
            }

            order.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                Text(
                    text = notes,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }

            HorizontalDivider(color = Color(0xFFF1F5F9))

            Text(
                text = "${order.doctorName ?: stringResource(R.string.prescriptions_default_doctor)}${order.doctorLicense?.let { " · $it" } ?: ""} · ${formatOrderDate(order.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )

            order.cuir?.takeIf { it.isNotBlank() }?.let { cuir ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "CUIR",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                            Text(
                                text = cuir,
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.SemiBold,
                                color = AuTextPrimary,
                            )
                        }
                        IconButton(onClick = { onCopyCuir(cuir) }) {
                            Icon(
                                imageVector = Icons.Outlined.ContentCopy,
                                contentDescription = stringResource(R.string.prescriptions_toast_cuir_copied),
                                tint = PortalPatientsAction,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }

            order.qrCodeContent?.takeIf { it.isNotBlank() }?.let { qr ->
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    QrCodeView(content = qr, sizeDp = 160)
                }
            }

            if (canDownloadPdf) {
                Button(
                    onClick = { onOpenPdf(order) },
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatientsAction,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 50.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.PictureAsPdf,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.docs_order_download_pdf),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun StudyType.localizedTitle(): String = when (this) {
    StudyType.LABORATORY -> stringResource(R.string.docs_study_type_lab)
    StudyType.IMAGING -> stringResource(R.string.docs_study_type_imaging)
    StudyType.CARDIOLOGY -> stringResource(R.string.docs_study_type_cardiology)
    StudyType.OTHER -> stringResource(R.string.docs_study_type_other)
}

private fun formatOrderDate(dateStr: String?): String {
    if (dateStr.isNullOrBlank()) return ""
    return runCatching {
        val instant = runCatching { Instant.parse(dateStr) }.getOrNull()
            ?: OffsetDateTime.parse(dateStr).toInstant()
        val localDate = instant.atZone(ZoneId.systemDefault()).toLocalDate()
        localDate.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.getDefault()))
    }.getOrDefault(dateStr.take(10))
}
