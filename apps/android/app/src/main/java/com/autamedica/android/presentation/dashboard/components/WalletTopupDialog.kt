package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import com.autamedica.android.presentation.health.healthText
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary

internal fun isSupportedWalletCurrency(currency: String?): Boolean =
    currency == "BRL" || currency == "ARS"

internal fun walletDefaultAmountFor(currency: String?): String = when (currency) {
    "BRL" -> "50"
    "ARS" -> "5000"
    else -> ""
}

internal fun walletQuickAmountsFor(currency: String?): List<String> = when (currency) {
    "BRL" -> listOf("20", "50", "100")
    "ARS" -> listOf("2000", "5000", "10000")
    else -> emptyList()
}

internal fun walletCurrencyPrefixFor(currency: String?): String? = when (currency) {
    "BRL" -> "R$ "
    "ARS" -> "$ "
    else -> null
}

@Composable
fun WalletTopupDialog(
    onDismiss: () -> Unit,
    currency: String? = null,
    isLoading: Boolean = false,
    errorMessage: String? = null,
    onConfirmTopup: (amount: Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val supportedCurrency = isSupportedWalletCurrency(currency)
    var amountText by remember(currency) { mutableStateOf(walletDefaultAmountFor(currency)) }
    val quickAmounts = walletQuickAmountsFor(currency)
    val currencyPrefix = walletCurrencyPrefixFor(currency)
    val chipSymbol = if (currency == "BRL") "R$" else "$"

    AlertDialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        shape = RoundedCornerShape(28.dp),
        containerColor = Color.White,
        modifier = modifier,
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.wallet_topup),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
                Text(
                    text = stringResource(R.string.wallet_topup_description),
                    fontSize = 12.sp,
                    color = AuTextSecondary,
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (!supportedCurrency) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFFFFFBEB),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = healthText(
                                "No pudimos verificar la moneda de tu billetera. Completá tu documento (DNI/CPF) o país de atención en Perfil antes de cargar saldo.",
                                "Não foi possível verificar a moeda da sua carteira. Complete seu CPF ou país de atendimento em Perfil antes de adicionar saldo.",
                            ),
                            fontSize = 12.5.sp,
                            color = Color(0xFF92400E),
                            modifier = Modifier.padding(14.dp),
                        )
                    }
                } else {
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { amountText = it.filter { ch -> ch.isDigit() } },
                        enabled = !isLoading,
                        label = {
                            Text(
                                stringResource(
                                    R.string.wallet_topup_amount_label,
                                    currency ?: stringResource(R.string.wallet_topup_currency_unknown),
                                ),
                            )
                        },
                        prefix = {
                            Text(
                                text = currencyPrefix.orEmpty(),
                                fontWeight = FontWeight.Bold,
                            )
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AuAccent,
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    // Quick amount chips (48dp min touch target)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        quickAmounts.forEach { amount ->
                            val isSelected = amountText == amount
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = if (isSelected) Color(0xFFE0F2FE) else Color(0xFFF8FAFC),
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) Color(0xFF38BDF8) else Color(0xFFE2E8F0),
                                ),
                                enabled = !isLoading,
                                onClick = { amountText = amount },
                                modifier = Modifier
                                    .weight(1f)
                                    .sizeIn(minHeight = 48.dp),
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 12.dp),
                                ) {
                                    Text(
                                        text = "$chipSymbol$amount",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSelected) Color(0xFF0369A1) else AuTextSecondary,
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    )
                                }
                            }
                        }
                    }
                }

                if (!errorMessage.isNullOrBlank()) {
                    Text(
                        text = errorMessage,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFDC2626),
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val parsed = amountText.toDoubleOrNull() ?: 0.0
                    if (parsed > 0 && supportedCurrency) {
                        onConfirmTopup(parsed)
                    }
                },
                shape = RoundedCornerShape(999.dp),
                enabled = !isLoading && supportedCurrency,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF0F172A),
                    contentColor = Color.White,
                ),
                modifier = Modifier.sizeIn(minHeight = 48.dp),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = Color.White,
                    )
                } else {
                    Text(stringResource(R.string.wallet_topup_confirm), fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isLoading,
                modifier = Modifier.sizeIn(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.wallet_topup_cancel), color = AuTextSecondary)
            }
        },
    )
}
