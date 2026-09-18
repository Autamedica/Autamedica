package com.autamedica.android.presentation.doctors.signature

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.autamedica.android.R
import com.autamedica.android.util.CountryContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorSignatureScreen(
    onNavigateBack: () -> Unit,
    viewModel: DoctorSignatureViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()
    val isBrazil = remember { CountryContext.isBrazil() }
    var paths by remember { mutableStateOf(mutableListOf<Path>()) }
    var currentPath by remember { mutableStateOf<Path?>(null) }
    var documentNumber by remember { mutableStateOf("") }
    var licenseNumber by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isBrazil) "Assinatura digital" else "Firma digital") }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            OutlinedTextField(
                value = documentNumber,
                onValueChange = {
                    val maxLen = if (isBrazil) 11 else 9
                    documentNumber = it.filter(Char::isDigit).take(maxLen)
                },
                label = { Text(stringResource(R.string.doctor_sig_dni_label)) },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = licenseNumber,
                onValueChange = { licenseNumber = it },
                label = { Text(stringResource(R.string.doctor_sig_license_label)) },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))
            
            Button(
                onClick = { viewModel.validateProfessionalDocument(documentNumber, licenseNumber) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            ) {
                Text(
                    if (state.isLoading) "Verificando…" else
                        if (state.sisaValidated) stringResource(R.string.doctor_sig_verified_button) else stringResource(R.string.doctor_sig_verify_button)
                )
            }

            when {
                state.isLoading -> Unit
                state.sisaValidated -> Text(
                    state.validationMessage ?: if (isBrazil) "CRM verificado com sucesso" else "Matrícula verificada en SISA/REFEPS",
                    color = Color(0xFF00C853),
                )
                state.errorMessage != null -> Text(
                    state.errorMessage!!,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            
            Text("Firma:", style = MaterialTheme.typography.titleMedium)
            
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp)
                    .background(Color.White)
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { offset ->
                                currentPath = Path().apply {
                                    moveTo(offset.x, offset.y)
                                }
                            },
                            onDrag = { change, dragAmount ->
                                change.consume()
                                currentPath?.lineTo(change.position.x, change.position.y)
                            },
                            onDragEnd = {
                                currentPath?.let { paths.add(it) }
                                currentPath = null
                            }
                        )
                    }
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    paths.forEach { path ->
                        drawPath(
                            path = path,
                            color = Color.Black,
                            style = Stroke(
                                width = 5f,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round
                            )
                        )
                    }
                    currentPath?.let { path ->
                        drawPath(
                            path = path,
                            color = Color.Black,
                            style = Stroke(
                                width = 5f,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round
                            )
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { 
                    paths.clear() 
                    currentPath = null
                }) {
                    Text("Borrar trazo")
                }
                
                Button(
                    onClick = { 
                        if (state.sisaValidated && paths.isNotEmpty()) {
                            viewModel.saveSignature(ByteArray(0)) // dummy signature
                        }
                    },
                    enabled = state.sisaValidated && !state.isLoading
                ) {
                    Text("Guardar firma")
                }
            }

            if (state.errorMessage != null && !state.sisaValidated) {
                Text(state.errorMessage!!, color = MaterialTheme.colorScheme.error)
            }
            if (state.isSuccess) {
                Text("Firma guardada correctamente.", color = Color(0xFF00C853))
            }
        }
    }
}
