package com.autamedica.core.util

/**
 * Utilitário oficial para validação, formatação e higienização de CPF
 * (Cadastro de Pessoas Físicas - Receita Federal do Brasil).
 *
 * Implementa o algoritmo canônico do Módulo 11 com cálculo ponderado dos dois
 * dígitos verificadores e rejeição de sequências com todos os dígitos repetidos.
 */
object CpfValidator {

    private val REPEATED_DIGIT_REGEX = Regex("^(\\d)\\1{10}$")

    /**
     * Remove todos os caracteres não numéricos de uma string de CPF.
     */
    fun clean(cpf: String?): String {
        if (cpf.isNullOrBlank()) return ""
        return cpf.filter { it.isDigit() }
    }

    /**
     * Valida se uma string é um CPF válido conforme as regras da Receita Federal.
     * Rejeita nulos, vazios, tamanhos != 11, dígitos repetidos (ex: 111.111.111-11, 000.000.000-00)
     * e CPFs com dígitos verificadores matematicamente incorretos (Módulo 11).
     */
    fun isValid(cpf: String?): Boolean {
        val cleaned = clean(cpf)

        if (cleaned.length != 11) return false
        if (REPEATED_DIGIT_REGEX.matches(cleaned)) return false

        // Cálculo do primeiro dígito verificador (DV1)
        var sum1 = 0
        for (i in 0 until 9) {
            val digit = cleaned[i].digitToInt()
            sum1 += digit * (10 - i)
        }
        val remainder1 = sum1 % 11
        val expectedDv1 = if (remainder1 < 2) 0 else 11 - remainder1
        if (cleaned[9].digitToInt() != expectedDv1) return false

        // Cálculo do segundo dígito verificador (DV2)
        var sum2 = 0
        for (i in 0 until 10) {
            val digit = cleaned[i].digitToInt()
            sum2 += digit * (11 - i)
        }
        val remainder2 = sum2 % 11
        val expectedDv2 = if (remainder2 < 2) 0 else 11 - remainder2
        if (cleaned[10].digitToInt() != expectedDv2) return false

        return true
    }

    /**
     * Formata um CPF no padrão oficial brasileiro: 000.000.000-00.
     * Caso a string limpa não possua exatamente 11 dígitos, retorna os dígitos limpos.
     */
    fun format(cpf: String?): String {
        val cleaned = clean(cpf)
        if (cleaned.length != 11) return cleaned
        return "${cleaned.substring(0, 3)}.${cleaned.substring(3, 6)}.${cleaned.substring(6, 9)}-${cleaned.substring(9, 11)}"
    }
}
