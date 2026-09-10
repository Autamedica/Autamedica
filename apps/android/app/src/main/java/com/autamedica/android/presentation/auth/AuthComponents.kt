package com.autamedica.android.presentation.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.LogoObsidianBg
import com.autamedica.android.presentation.theme.LogoRingBorder
import com.autamedica.android.presentation.theme.PortalCompanies
import com.autamedica.android.presentation.theme.PortalCompaniesSoft
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalDoctorsSoft
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PortalPatientsSoft
import com.autamedica.android.presentation.theme.PortalPharmacists
import com.autamedica.android.presentation.theme.PortalPharmacistsSoft

/**
 * Emblema & Header Biocerámico:
 * Contenedor squircle (96x96dp) color obsidiana (#09090B), bordes suaves de 30dp,
 * anillo translúcido (border-white/10) y sombra de vidrio ahumado (shadow-am-glass-logo).
 */
@Composable
fun AuthLogoHeader(
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .size(96.dp)
            .shadow(
                elevation = 16.dp,
                shape = RoundedCornerShape(30.dp),
                clip = false,
                ambientColor = Color(0x99000000),
                spotColor = Color(0xCC000000),
            ),
        shape = RoundedCornerShape(30.dp),
        color = LogoObsidianBg,
        border = BorderStroke(1.dp, LogoRingBorder),
        shadowElevation = 16.dp,
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.fillMaxSize(),
        ) {
            Image(
                painter = painterResource(id = R.drawable.logo_autamedica),
                contentDescription = "AutaMedica",
                modifier = Modifier
                    .size(76.dp)
                    .clip(RoundedCornerShape(16.dp)),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/**
 * Portal Identifier Badge:
 * Badge superior translúcido indicando modo de acceso clínico con indicador radiante.
 */
@Composable
fun PortalAccessBadge(
    activeColor: Color,
    modifier: Modifier = Modifier,
    label: String = "MODO DE ACCESO",
) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = activeColor.copy(alpha = 0.10f),
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(activeColor),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.6.sp,
                ),
                color = AuTextSecondary,
            )
        }
    }
}

/**
 * Selector segmentado de 4 portales (Paciente, Médico, Farmacia, Empresa)
 * con acentos de color y fondos suaves idénticos al sistema web de AutaMedica:
 * - Paciente: Sky-500 (#0EA5E9) + PortalPatientsSoft
 * - Médico: Cyan-600 (#0891B2) + PortalDoctorsSoft
 * - Farmacia: Emerald-600 (#059669) + PortalPharmacistsSoft
 * - Empresa: Slate-600 (#475569) + PortalCompaniesSoft
 */
@Composable
fun RoleSegmentedPicker(
    selectedRole: UserRole,
    onRoleSelected: (UserRole) -> Unit,
    modifier: Modifier = Modifier,
) {
    val roles = listOf(
        Triple(UserRole.PATIENT, "Paciente", PortalPatients to PortalPatientsSoft),
        Triple(UserRole.DOCTOR, "Médico", PortalDoctors to PortalDoctorsSoft),
        Triple(UserRole.PHARMACIST, "Farmacia", PortalPharmacists to PortalPharmacistsSoft),
        Triple(UserRole.COMPANY, "Empresa", PortalCompanies to PortalCompaniesSoft),
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            roles.forEach { (role, label, colorPair) ->
                val (roleColor, roleSoft) = colorPair
                val isSelected = selectedRole == role

                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (isSelected) roleSoft else Color.Transparent)
                        .border(
                            width = 1.dp,
                            color = if (isSelected) roleColor.copy(alpha = 0.40f) else Color.Transparent,
                            shape = RoundedCornerShape(14.dp),
                        )
                        .clickable { onRoleSelected(role) }
                        .padding(vertical = 10.dp),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        when (role) {
                            UserRole.PATIENT -> Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                            UserRole.DOCTOR -> Icon(
                                imageVector = Icons.Outlined.MedicalServices,
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                            UserRole.PHARMACIST -> Icon(
                                painter = painterResource(id = R.drawable.ic_medical_cross_outline),
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                            else -> Icon(
                                painter = painterResource(id = R.drawable.ic_profile_outline),
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                letterSpacing = 0.8.sp,
                            ),
                            fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium,
                            color = if (isSelected) AuTextPrimary else AuTextTertiary,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Card Clínica de Autenticación:
 * Superficie blanca pura (#FFFFFF), bordes sutiles con tinte sky (rgba(14, 165, 233, 0.12)),
 * esquinas redondeadas de 26dp y sombra clínica suave (am-card).
 */
@Composable
fun AuthCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(26.dp),
                clip = false,
                ambientColor = Color(0x140EA5E9),
                spotColor = Color(0x1F0EA5E9),
            ),
        shape = RoundedCornerShape(26.dp),
        color = Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 8.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            content = content,
        )
    }
}

/**
 * Botón oficial de Google Sign-In:
 * Fondo blanco (#FFFFFF), borde tenue sky (AuBorder), y tipografía Slate-700 (AuTextSecondary).
 */
@Composable
fun GoogleSignInButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp),
        enabled = enabled && !isLoading,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, AuBorder),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = AuTextSecondary,
            disabledContainerColor = Color.White,
            disabledContentColor = AuTextTertiary,
        ),
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = AuTextSecondary,
                strokeWidth = 2.dp,
            )
        } else {
            Icon(
                painter = painterResource(id = R.drawable.ic_google),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = Color.Unspecified,
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "Continuar con Google",
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
            )
        }
    }
}

/**
 * Input clínico con label exterior claro, tipografía de alto contraste (#050505),
 * contenedor suave y focus ring en sky (#0EA5E9).
 */
@Composable
fun AuthLabeledTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    activeFocusColor: Color = AuAccent,
    headerTrailing: @Composable (() -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = AuTextSecondary,
                fontWeight = FontWeight.Medium,
            )
            headerTrailing?.invoke()
        }

        val textFieldColors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = AuTextPrimary,
            unfocusedTextColor = AuTextPrimary,
            focusedContainerColor = AuSurface,
            unfocusedContainerColor = AuSurface,
            focusedBorderColor = activeFocusColor,
            unfocusedBorderColor = AuBorder,
            focusedLabelColor = activeFocusColor,
            unfocusedLabelColor = AuTextTertiary,
            cursorColor = activeFocusColor,
        )

        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = if (placeholder.isNotEmpty()) {
                { Text(placeholder, color = AuTextTertiary) }
            } else null,
            leadingIcon = leadingIcon,
            trailingIcon = trailingIcon,
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            singleLine = singleLine,
            enabled = enabled,
            shape = RoundedCornerShape(16.dp),
            colors = textFieldColors,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
