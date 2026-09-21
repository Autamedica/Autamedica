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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorSignatureScreen(
    onNavigateBack: () -> Unit,
    viewModel: DoctorSignatureViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()
    var paths by remember { mutableStateOf(mutableListOf<Path>()) }
    var currentPath by remember { mutableStateOf<Path?>(null) }
    var dni by remember { mutableStateOf("") }
    var licenseNumber by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.signature_title)) }
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
                value = dni,
                onValueChange = { dni = it.filter(Char::isDigit).take(9) },
                label = { Text(stringResource(R.string.signature_label_dni)) },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = licenseNumber,
                onValueChange = { licenseNumber = it },
                label = { Text(stringResource(R.string.signature_label_license)) },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))
            
            Button(
                onClick = { viewModel.validateWithSisaRefeps(dni, licenseNumber) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            ) {
                val buttonText = when {
                    state.isLoading -> stringResource(R.string.signature_verifying)
                    state.sisaValidated -> stringResource(R.string.signature_status_verified_button)
                    else -> stringResource(R.string.signature_button_verify)
                }
                Text(buttonText)
            }

            when {
                state.isLoading -> Unit
                state.sisaValidated -> {
                    val verifiedMsg = state.validationMessageRes?.let { stringResource(it) }
                        ?: state.validationMessage
                        ?: stringResource(R.string.signature_status_sisa_verified)
                    Text(
                        verifiedMsg,
                        color = Color(0xFF00C853),
                    )
                }
                state.errorMessageRes != null -> {
                    Text(
                        stringResource(state.errorMessageRes!!),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                state.errorMessage != null -> {
                    Text(
                        state.errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            
            Text(stringResource(R.string.signature_pad_label), style = MaterialTheme.typography.titleMedium)
            
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
                    Text(stringResource(R.string.signature_clear_button))
                }
                
                Button(
                    onClick = { 
                        if (state.sisaValidated && paths.isNotEmpty()) {
                            viewModel.saveSignature(ByteArray(0)) // dummy signature
                        }
                    },
                    enabled = state.sisaValidated && !state.isLoading
                ) {
                    Text(stringResource(R.string.signature_save_button))
                }
            }

            if (state.errorMessageRes != null && !state.sisaValidated) {
                Text(stringResource(state.errorMessageRes!!), color = MaterialTheme.colorScheme.error)
            } else if (state.errorMessage != null && !state.sisaValidated) {
                Text(state.errorMessage!!, color = MaterialTheme.colorScheme.error)
            }
            if (state.isSuccess) {
                Text(stringResource(R.string.signature_saved_success), color = Color(0xFF00C853))
            }
        }
    }
}
