package com.autamedica.android.presentation.patients.psychiatry

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

data class TdahQuestion(
    val id: Int,
    val text: String,
    val score: Int = 0 // 0 to 4
)

data class TdahState(
    val isLoading: Boolean = false,
    val isCompleted: Boolean = false,
    val totalScore: Int = 0,
    val diagnosticResult: String? = null,
    val questions: List<TdahQuestion> = listOf(
        TdahQuestion(1, "¿Con qué frecuencia tiene dificultad para terminar los detalles finales de un proyecto?"),
        TdahQuestion(2, "¿Con qué frecuencia tiene dificultad para ordenar las cosas en tareas organizativas?"),
        TdahQuestion(3, "¿Con qué frecuencia tiene problemas para recordar citas u obligaciones?"),
        TdahQuestion(4, "¿Cuándo tiene una tarea que requiere pensar mucho, con qué frecuencia la evita o posterga?"),
        TdahQuestion(5, "¿Con qué frecuencia mueve o retuerce las manos o los pies al tener que permanecer sentado?"),
        TdahQuestion(6, "¿Con qué frecuencia se siente demasiado activo o impulsado por un motor interno?")
    )
)

class TdahEvaluationViewModel : ViewModel() {
    private val _state = MutableStateFlow(TdahState())
    val state: StateFlow<TdahState> = _state.asStateFlow()

    fun updateScore(questionId: Int, score: Int) {
        _state.update { current ->
            val updated = current.questions.map { q ->
                if (q.id == questionId) q.copy(score = score) else q
            }
            current.copy(questions = updated)
        }
    }

    fun submitEvaluation() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            delay(1200)
            val sum = _state.value.questions.sumOf { it.score }
            val result = if (sum >= 14) {
                "Probabilidad ALTA de síntomas consistentes con TDAH del adulto (Score: " + sum + "/24). Se recomienda evaluación psiquiátrica formal."
            } else if (sum >= 9) {
                "Probabilidad MODERADA (Score: " + sum + "/24). Sugerido seguimiento y registro de síntomas."
            } else {
                "Baja probabilidad de TDAH (Score: " + sum + "/24). Criterios clínicos estándar no alcanzados."
            }
            _state.update {
                it.copy(
                    isLoading = false,
                    isCompleted = true,
                    totalScore = sum,
                    diagnosticResult = result
                )
            }
        }
    }
}
