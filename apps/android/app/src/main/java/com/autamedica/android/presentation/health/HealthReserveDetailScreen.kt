package com.autamedica.android.presentation.health

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Biotech
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.FamilyRestroom
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MonetizationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import java.text.NumberFormat
import java.util.Locale

// ── Models ────────────────────────────────────────────────────────────────────

data class PlanFeature(
    val label: String,
    val included: Boolean,
)

data class ReservePlan(
    val name: String,
    val tierKey: String,
    val priceMonthlyArs: Int,
    val monthlyCredits: Int,
    val maxCapCredits: Int,
    val badgeText: String? = null,
    val summaryText: String,
    val color: Color,
    val icon: ImageVector,
    val features: List<PlanFeature>,
    val isPopular: Boolean = false,
)

data class BenefitCategoryItem(
    val categoryKey: String,
    val title: String,
    val creditsCost: Int,
    val referenceMarketPriceArs: Int,
    val description: String,
    val examples: String,
    val icon: ImageVector,
    val accentColor: Color,
)

// ── Canonical Data Definitions ────────────────────────────────────────────────

val defaultReservePlans: List<ReservePlan> = listOf(
    ReservePlan(
        name = "Free",
        tierKey = "free",
        priceMonthlyArs = 0,
        monthlyCredits = 0,
        maxCapCredits = 0,
        badgeText = null,
        summaryText = "Acceso libre a la plataforma de telemedicina y recetas digitales para consultas puntuales.",
        color = Color(0xFF64748B),
        icon = Icons.Outlined.HealthAndSafety,
        features = listOf(
            PlanFeature("Historia clínica digital en tu celular", true),
            PlanFeature("Receta médica con firma electrónica", true),
            PlanFeature("Pago individual por consulta avulsa", true),
            PlanFeature("1 consulta médica mensual incluida", false),
            PlanFeature("Reserva de créditos acumulativos", false),
            PlanFeature("Prioridad en guardia virtual 24/7", false),
        ),
    ),
    ReservePlan(
        name = "Cuidado",
        tierKey = "cuidado",
        priceMonthlyArs = 4_990,
        monthlyCredits = 22,
        maxCapCredits = 600,
        badgeText = "Más Elegido",
        summaryText = "1 teleconsulta médica mensual incluida y Reserva de Salud: si no usás tu consulta, acumulás créditos para especialistas, laboratorios y farmacia.",
        color = Color(0xFF0EA5E9),
        icon = Icons.Outlined.MedicalServices,
        features = listOf(
            PlanFeature("1 teleconsulta médica clínica mensual", true),
            PlanFeature("Usa o Acumula: +22 créditos/mes sin uso", true),
            PlanFeature("Canje en especialistas, laboratorios y farmacia", true),
            PlanFeature("Recetas e indicaciones electrónicas ilimitadas", true),
            PlanFeature("Prioridad de atención en guardia 24/7", true),
            PlanFeature("Pago simple vía Pix o Tarjeta de crédito", true),
        ),
        isPopular = true,
    ),
    ReservePlan(
        name = "Familiar",
        tierKey = "familiar",
        priceMonthlyArs = 12_990,
        monthlyCredits = 66,
        maxCapCredits = 1_800,
        badgeText = "Cobertura Compartida",
        summaryText = "Protección médica para hasta 4 miembros del grupo familiar con reserva unificada y acumulación compartida.",
        color = Color(0xFF8B5CF6),
        icon = Icons.Outlined.FamilyRestroom,
        features = listOf(
            PlanFeature("Cobertura integral para hasta 4 integrantes", true),
            PlanFeature("Consultas mensuales para todo el grupo familiar", true),
            PlanFeature("Reserva unificada: acumulan juntos cada mes", true),
            PlanFeature("Canje flexible para cualquier miembro", true),
            PlanFeature("Historia clínica separada por familiar", true),
            PlanFeature("Asistencia médica prioritaria continua", true),
        ),
    ),
)

val defaultBenefitCategories: List<BenefitCategoryItem> = listOf(
    BenefitCategoryItem(
        categoryKey = "specialists",
        title = "Consultas con Especialistas",
        creditsCost = 100,
        referenceMarketPriceArs = 15_000,
        description = "Cardiología, dermatología, traumatología, ginecología y más de 20 especialidades en red.",
        examples = "Videoconsultas de 30 minutos o turnos presenciales sin copagos.",
        icon = Icons.Outlined.MedicalServices,
        accentColor = Color(0xFF0EA5E9),
    ),
    BenefitCategoryItem(
        categoryKey = "labs",
        title = "Estudios y Laboratorios",
        creditsCost = 60,
        referenceMarketPriceArs = 9_000,
        description = "Paneles completos de rutina preventiva y análisis clínicos en laboratorios conveniados.",
        examples = "Hemograma completo, perfil lipídico, glucemia y orina completa.",
        icon = Icons.Outlined.Biotech,
        accentColor = Color(0xFF10B981),
    ),
    BenefitCategoryItem(
        categoryKey = "pharmacy",
        title = "Farmacia y Medicamentos",
        creditsCost = 55,
        referenceMarketPriceArs = 8_000,
        description = "Vouchers directos para medicamentos recetados de uso continuo y tratamientos crónicos.",
        examples = "Antihipertensivos, hipoglucemiantes y fármacos ambulatorios esenciales.",
        icon = Icons.Outlined.Medication,
        accentColor = Color(0xFF8B5CF6),
    ),
)

// ── Pure Helper Functions ─────────────────────────────────────────────────────

fun calculateEstimatedArs(credits: Int): Int = credits * 150

fun calculateProgressFraction(credits: Int, maxCap: Int): Float {
    if (maxCap <= 0) return 0f
    return (credits.toFloat() / maxCap.toFloat()).coerceIn(0f, 1f)
}

fun formatCredits(credits: Int): String =
    NumberFormat.getNumberInstance(Locale("es", "AR")).format(credits)

fun formatArs(amount: Int): String {
    val format = NumberFormat.getCurrencyInstance(Locale("es", "AR"))
    format.maximumFractionDigits = 0
    return format.format(amount)
}

fun getPlanByTier(tierKey: String): ReservePlan =
    defaultReservePlans.find { it.tierKey == tierKey.lowercase() } ?: defaultReservePlans.first()

private val ptReservePlans: List<ReservePlan> = listOf(
    defaultReservePlans[0].copy(
        name = "Gratuito",
        summaryText = "Acesso livre à plataforma de telemedicina e receitas digitais para consultas avulsas.",
        features = listOf(
            PlanFeature("Prontuário clínico digital no seu celular", true),
            PlanFeature("Receita médica com assinatura eletrônica", true),
            PlanFeature("Pagamento individual por consulta avulsa", true),
            PlanFeature("1 consulta médica mensal incluída", false),
            PlanFeature("Reserva de créditos acumulativos", false),
            PlanFeature("Prioridade no plantão virtual 24/7", false),
        ),
    ),
    defaultReservePlans[1].copy(
        name = "Cuidado",
        badgeText = "Mais Escolhido",
        summaryText = "1 teleconsulta médica mensal incluída e Reserva de Saúde: se você não usar sua consulta, acumula créditos para especialistas, laboratórios e farmácia.",
        features = listOf(
            PlanFeature("1 teleconsulta clínica mensal", true),
            PlanFeature("Use ou Acumule: +22 créditos/mês sem uso", true),
            PlanFeature("Resgate em especialistas, laboratórios e farmácia", true),
            PlanFeature("Receitas e pedidos eletrônicos ilimitados", true),
            PlanFeature("Prioridade de atendimento no plantão 24/7", true),
            PlanFeature("Pagamento simples via Pix ou Cartão de crédito", true),
        ),
    ),
    defaultReservePlans[2].copy(
        name = "Familiar",
        badgeText = "Cobertura Compartilhada",
        summaryText = "Proteção médica para até 4 membros do grupo familiar com reserva unificada e acúmulo compartilhado.",
        features = listOf(
            PlanFeature("Cobertura integral para até 4 integrantes", true),
            PlanFeature("Consultas mensais para todo o grupo familiar", true),
            PlanFeature("Reserva unificada: acumulem juntos todo mês", true),
            PlanFeature("Resgate flexível para qualquer membro", true),
            PlanFeature("Prontuário separado por familiar", true),
            PlanFeature("Assistência médica prioritária contínua", true),
        ),
    ),
)

private val ptBenefitCategories: List<BenefitCategoryItem> = listOf(
    defaultBenefitCategories[0].copy(
        title = "Consultas com Especialistas",
        description = "Cardiologia, dermatologia, ortopedia, ginecologia e mais de 20 especialidades na rede.",
        examples = "Videoconsultas de 30 minutos ou consultas presenciais sem coparticipação.",
    ),
    defaultBenefitCategories[1].copy(
        title = "Exames e Laboratórios",
        description = "Painéis completos de rotina preventiva e análises clínicas em laboratórios credenciados.",
        examples = "Hemograma completo, perfil lipídico, glicemia e urina tipo 1.",
    ),
    defaultBenefitCategories[2].copy(
        title = "Farmácia e Medicamentos",
        description = "Vouchers diretos para medicamentos prescritos de uso contínuo e tratamentos crônicos.",
        examples = "Anti-hipertensivos, hipoglicemiantes e medicamentos ambulatoriais essenciais.",
    ),
)

internal fun localizedReservePlans(isPortuguese: Boolean): List<ReservePlan> =
    if (isPortuguese) ptReservePlans else defaultReservePlans

internal fun localizedBenefitCategories(isPortuguese: Boolean): List<BenefitCategoryItem> =
    if (isPortuguese) ptBenefitCategories else defaultBenefitCategories

internal fun getLocalizedPlanByTier(tierKey: String, isPortuguese: Boolean): ReservePlan {
    val plans = localizedReservePlans(isPortuguese)
    return plans.find { it.tierKey == tierKey.lowercase() } ?: plans.first()
}

internal fun formatLocalizedCredits(credits: Int, isPortuguese: Boolean): String =
    if (isPortuguese) {
        NumberFormat.getNumberInstance(Locale("pt", "BR")).format(credits)
    } else {
        formatCredits(credits)
    }

internal fun formatLocalizedReferenceAmount(amountArs: Int, isPortuguese: Boolean): String {
    if (!isPortuguese) return formatArs(amountArs)
    val format = NumberFormat.getCurrencyInstance(Locale("pt", "BR"))
    format.maximumFractionDigits = 0
    return format.format(amountArs / 100.0)
}

internal fun formatLocalizedMonthlyPlanPrice(
    plan: ReservePlan,
    isPortuguese: Boolean,
    forModal: Boolean = false,
): String {
    if (!isPortuguese) {
        return if (plan.priceMonthlyArs > 0) {
            "${formatArs(plan.priceMonthlyArs)} / mes"
        } else if (forModal) {
            "Gratis para siempre"
        } else {
            "Gratis"
        }
    }
    return when {
        plan.priceMonthlyArs <= 0 -> if (forModal) "Grátis para sempre" else "Grátis"
        plan.tierKey == "cuidado" -> "R$ 49,90 / mês"
        plan.tierKey == "familiar" -> "R$ 119,90 / mês"
        else -> "${formatLocalizedReferenceAmount(plan.priceMonthlyArs, true)} / mês"
    }
}

// ── Main Screen Composable ────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthReserveDetailScreen(
    subscriptionTier: String = "free",
    benefitBalanceCredits: Int = 0,
    maxCapCredits: Int = 0,
    onBack: () -> Unit = {},
    onActivatePlan: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    var activeTier by remember(subscriptionTier) { mutableStateOf(subscriptionTier.lowercase()) }
    var currentCredits by remember(benefitBalanceCredits) { mutableIntStateOf(benefitBalanceCredits) }
    var currentMaxCap by remember(maxCapCredits) { mutableIntStateOf(maxCapCredits.coerceAtLeast(0)) }
    var selectedPlanForActivation by remember { mutableStateOf<ReservePlan?>(null) }
    var isActivating by remember { mutableStateOf(false) }
    var activationSuccessMessage by remember { mutableStateOf<String?>(null) }
    var simulatedMonths by remember { mutableIntStateOf(3) }

    val isPortuguese = isPortugueseUi()
    val plans = localizedReservePlans(isPortuguese)
    val categories = localizedBenefitCategories(isPortuguese)
    val currentPlan = getLocalizedPlanByTier(activeTier, isPortuguese)
    val progressFraction = calculateProgressFraction(currentCredits, currentMaxCap)

    // BackHandler: cierra modal de activación si está abierto, o regresa a Inicio
    BackHandler {
        if (selectedPlanForActivation != null) {
            selectedPlanForActivation = null
        } else {
            onBack()
        }
    }

    // Animación suave de la barra de progreso al cargar o cambiar saldo
    var targetProgress by remember { mutableFloatStateOf(0f) }
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress,
        animationSpec = tween(durationMillis = 900, easing = FastOutSlowInEasing),
        label = "HealthReserveProgressAnimation",
    )
    LaunchedEffect(progressFraction) {
        targetProgress = progressFraction
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = healthText("Reserva de Salud", "Reserva de Saúde"),
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = healthText(
                                es = "Planes Transparentes & Beneficios Acumulables",
                                pt = "Planos Transparentes & Benefícios Acumuláveis",
                            ),
                            fontSize = 11.sp,
                            color = AuTextSecondary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = healthText("Regresar al inicio", "Voltar ao início"),
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ── Feedback Banner de Éxito al activar plan ──────────────────
            if (activationSuccessMessage != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF064E3B),
                        border = BorderStroke(1.dp, Color(0xFF10B981)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF34D399),
                                modifier = Modifier.size(24.dp),
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = healthText("¡Plan actualizado!", "Plano atualizado!"),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                )
                                Text(
                                    text = activationSuccessMessage ?: "",
                                    fontSize = 12.sp,
                                    color = Color(0xFFD1FAE5),
                                )
                            }
                            IconButton(
                                onClick = { activationSuccessMessage = null },
                                modifier = Modifier.size(36.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Close,
                                    contentDescription = healthText("Cerrar", "Fechar"),
                                    tint = Color.White.copy(alpha = 0.7f),
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }
            }

            // ── 1. Hero Card: Créditos Acumulados & Estimación ARS ────────
            item {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Color(0xFF09090B),
                    border = BorderStroke(1.dp, Color(0xFF27272A)),
                    shadowElevation = 6.dp,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // Badge superior
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = Color(0x260EA5E9),
                                border = BorderStroke(1.dp, Color(0x4D0EA5E9)),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.AutoAwesome,
                                        contentDescription = null,
                                        tint = Color(0xFF38BDF8),
                                        modifier = Modifier.size(13.dp),
                                    )
                                    Spacer(Modifier.width(5.dp))
                                    Text(
                                        text = healthText("RESERVA DE SALUD", "RESERVA DE SAÚDE"),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF38BDF8),
                                        letterSpacing = 0.6.sp,
                                    )
                                }
                            }

                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = currentPlan.color.copy(alpha = 0.15f),
                            ) {
                                Text(
                                    text = if (isPortuguese) "Plano ${currentPlan.name}" else "Plan ${currentPlan.name}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = currentPlan.color,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                            }
                        }

                        // Contador de créditos y equivalente ARS/BRL
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Bottom,
                            ) {
                                Column {
                                    Text(
                                        text = formatLocalizedCredits(currentCredits, isPortuguese),
                                        fontSize = 42.sp,
                                        fontWeight = FontWeight.Light,
                                        color = Color.White,
                                        letterSpacing = (-1).sp,
                                    )
                                    Text(
                                        text = healthText(
                                            es = "AUTA Créditos disponibles",
                                            pt = "Créditos AUTA disponíveis",
                                        ),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF94A3B8),
                                    )
                                }

                                Column(horizontalAlignment = Alignment.End) {
                                    val estimatedArs = calculateEstimatedArs(currentCredits)
                                    Text(
                                        text = formatLocalizedReferenceAmount(estimatedArs, isPortuguese),
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF38BDF8),
                                    )
                                    Text(
                                        text = healthText(
                                            es = "equiv. estimado en red",
                                            pt = "equiv. estimado na rede",
                                        ),
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B),
                                    )
                                }
                            }

                            Spacer(Modifier.height(4.dp))

                            // Barra de progreso animada con esquinas redondeadas
                            LinearProgressIndicator(
                                progress = { animatedProgress },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(10.dp)
                                    .clip(RoundedCornerShape(999.dp)),
                                color = Color(0xFF0EA5E9),
                                trackColor = Color(0xFF1E293B),
                                strokeCap = StrokeCap.Round,
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = healthText("0 créditos", "0 créditos"),
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                )
                                Text(
                                    text = if (isPortuguese) {
                                        "Limite acumulável: ${formatLocalizedCredits(currentMaxCap, true)} pts"
                                    } else {
                                        "Tope acumulable: ${formatCredits(currentMaxCap)} pts"
                                    },
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF94A3B8),
                                )
                            }
                        }

                        // Aclaración de valor acumulativo
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0x0DFFFFFF),
                            border = BorderStroke(1.dp, Color(0x14FFFFFF)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = healthText(
                                    es = "💡 Si estás sano y no usás tu consulta del mes, tu dinero no se pierde: se transforma en créditos de salud para especialistas, análisis clínicos y farmacia.",
                                    pt = "💡 Se estiver saudável e não usar sua consulta do mês, seu valor não se perde: vira créditos de saúde para especialistas, exames e farmácia.",
                                ),
                                fontSize = 12.sp,
                                color = Color(0xFFCBD5E1),
                                lineHeight = 17.sp,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }
                }
            }

            // ── 2. Desglose Explicativo: ¿Dónde se usan los créditos? ──────
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = healthText(
                            es = "¿Dónde podés usar tus créditos?",
                            pt = "Onde você pode usar seus créditos?",
                        ),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = healthText(
                            es = "Canjeá directamente en la red de prestadores sin copagos sorpresa.",
                            pt = "Resgate direto na rede credenciada sem copagamentos surpresa.",
                        ),
                        fontSize = 13.sp,
                        color = AuTextSecondary,
                    )
                }
            }

            items(categories.size) { index ->
                val category = categories[index]
                val hasEnoughCredits = currentCredits >= category.creditsCost
                BenefitCategoryCard(
                    category = category,
                    currentCredits = currentCredits,
                    hasEnoughCredits = hasEnoughCredits,
                )
            }

            // ── 3. Simulador de Economía: Usa o Acumula ───────────────────
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Outlined.AutoAwesome,
                                contentDescription = null,
                                tint = Color(0xFF0EA5E9),
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = healthText(
                                    es = "Simulador: ¿Cuánto podés acumular?",
                                    pt = "Simulador: quanto você pode acumular?",
                                ),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                        Text(
                            text = healthText(
                                es = "Elegí el tiempo de meses saludables sin consultas para proyectar tus créditos acumulados:",
                                pt = "Escolha a quantidade de meses saudáveis sem consultas para projetar seus créditos acumulados:",
                            ),
                            fontSize = 12.sp,
                            color = AuTextSecondary,
                            lineHeight = 17.sp,
                        )

                        // Selector de meses
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            listOf(1, 3, 6, 12).forEach { months ->
                                val isSelected = simulatedMonths == months
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { simulatedMonths = months },
                                    label = {
                                        Text(
                                            text = if (months == 1) {
                                                healthText("1 mes", "1 mês")
                                            } else {
                                                "$months meses"
                                            },
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        )
                                    },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = Color(0xFF0EA5E9),
                                        selectedLabelColor = Color.White,
                                        containerColor = AuSurfaceHover,
                                        labelColor = AuTextSecondary,
                                    ),
                                    border = FilterChipDefaults.filterChipBorder(
                                        enabled = true,
                                        selected = isSelected,
                                        borderColor = if (isSelected) Color(0xFF0EA5E9) else AuBorder,
                                    ),
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }

                        val projectedCredits = simulatedMonths * 22
                        val projectedArs = calculateEstimatedArs(projectedCredits)

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFF0F172A),
                            border = BorderStroke(1.dp, Color(0xFF1E293B)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text(
                                        text = if (isPortuguese) {
                                            "+$projectedCredits Créditos AUTA"
                                        } else {
                                            "+$projectedCredits AUTA Créditos"
                                        },
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White,
                                    )
                                    Text(
                                        text = if (isPortuguese) {
                                            "Equivalente estimado: ${formatLocalizedReferenceAmount(projectedArs, true)}"
                                        } else {
                                            "Equivalente estimado: ${formatArs(projectedArs)}"
                                        },
                                        fontSize = 12.sp,
                                        color = Color(0xFF38BDF8),
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = Color(0x330EA5E9),
                                ) {
                                    Text(
                                        text = when {
                                            projectedCredits >= 100 -> healthText("Especialistas desbloqueados", "Especialistas liberados")
                                            projectedCredits >= 60 -> healthText("Check-up desbloqueado", "Check-up liberado")
                                            projectedCredits >= 55 -> healthText("Farmacia desbloqueada", "Farmácia liberada")
                                            else -> healthText("Acumulación inicial", "Acúmulo inicial")
                                        },
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF38BDF8),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ── 4. Comparador de Planes: Free, Cuidado, Familiar ──────────
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = healthText("Comparador de Planes", "Comparador de Planos"),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = healthText(
                            es = "Transparencia total. Cambiá o cancelá tu suscripción cuando lo decidas.",
                            pt = "Transparência total. Altere ou cancele sua assinatura quando quiser.",
                        ),
                        fontSize = 13.sp,
                        color = AuTextSecondary,
                    )
                }
            }

            items(plans.size) { index ->
                val plan = plans[index]
                val isCurrentPlan = plan.tierKey == activeTier
                DetailedPlanCard(
                    plan = plan,
                    isCurrentPlan = isCurrentPlan,
                    onSelect = {
                        if (!isCurrentPlan) {
                            selectedPlanForActivation = plan
                        }
                    },
                )
            }

            // ── 5. Preguntas Frecuentes (FAQ) ──────────────────────────────
            item {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = healthText("Preguntas Frecuentes", "Perguntas Frequentes"),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )

                        FaqAccordionItem(
                            question = healthText(
                                es = "¿Qué sucede si no uso mi consulta en el mes?",
                                pt = "O que acontece se eu não usar minha consulta no mês?",
                            ),
                            answer = healthText(
                                es = "Si tenés el Plan Cuidado o Familiar, sumás automáticamente 22 AUTA Créditos a tu Reserva de Salud para canjear más adelante en especialistas, análisis clínicos o farmacia.",
                                pt = "Se você tem o Plano Cuidado ou Familiar, soma automaticamente 22 Créditos AUTA à sua Reserva de Saúde para resgatar depois em especialistas, exames ou farmácia.",
                            ),
                        )
                        FaqAccordionItem(
                            question = healthText("¿Los créditos vencen?", "Os créditos vencem?"),
                            answer = healthText(
                                es = "Tienen una vigencia de hasta 24 meses mientras mantengas tu suscripción activa, permitiéndote acumular hasta el tope fijado por tu plan.",
                                pt = "Eles têm validade de até 24 meses enquanto você mantiver sua assinatura ativa, permitindo acumular até o limite do seu plano.",
                            ),
                        )
                        FaqAccordionItem(
                            question = healthText("¿Cómo canjeo mis créditos?", "Como resgato meus créditos?"),
                            answer = healthText(
                                es = "Directamente desde la app: seleccionás el servicio deseado en la red conveniada, generás tu voucher digital e ingresás a la consulta o presentás el código en farmacia.",
                                pt = "Diretamente pelo app: escolha o serviço desejado na rede credenciada, gere seu voucher digital e acesse a consulta ou apresente o código na farmácia.",
                            ),
                        )
                        FaqAccordionItem(
                            question = healthText("¿Puedo cancelar mi plan cuando quiera?", "Posso cancelar meu plano quando quiser?"),
                            answer = healthText(
                                es = "Sí, 100% online y en cualquier momento sin períodos mínimos de permanencia ni penalizaciones.",
                                pt = "Sim, 100% online e a qualquer momento, sem fidelidade mínima nem multas.",
                            ),
                        )
                    }
                }
            }

            // Disclaimer Legal
            item {
                Text(
                    text = healthText(
                        es = "AutaMedica es una plataforma tecnológica de telemedicina y programa de beneficios en red conveniada. No es una empresa de medicina prepaga ni aseguradora.",
                        pt = "A AutaMedica é uma plataforma tecnológica de telemedicina e programa de benefícios em rede credenciada. Não é operadora de plano de saúde nem seguradora.",
                    ),
                    fontSize = 11.sp,
                    color = AuTextTertiary,
                    textAlign = TextAlign.Center,
                    lineHeight = 15.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                )
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    // ── 6. Bottom Sheet de Confirmación y Activación ───────────────
    val planToActivate = selectedPlanForActivation
    if (planToActivate != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = {
                if (!isActivating) {
                    selectedPlanForActivation = null
                }
            },
            sheetState = sheetState,
            containerColor = Color(0xFF0F172A),
            scrimColor = Color.Black.copy(alpha = 0.6f),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Título del plan
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = if (isPortuguese) {
                                "Ativar Plano ${planToActivate.name}"
                            } else {
                                "Activar Plan ${planToActivate.name}"
                            },
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        )
                        Text(
                            text = formatLocalizedMonthlyPlanPrice(
                                plan = planToActivate,
                                isPortuguese = isPortuguese,
                                forModal = true,
                            ),
                            fontSize = 14.sp,
                            color = Color(0xFF38BDF8),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    IconButton(
                        onClick = { selectedPlanForActivation = null },
                        enabled = !isActivating,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = healthText("Cerrar modal", "Fechar modal"),
                            tint = Color.White.copy(alpha = 0.7f),
                        )
                    }
                }

                // Resumen de beneficios
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0x14FFFFFF),
                    border = BorderStroke(1.dp, Color(0x24FFFFFF)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = healthText("Beneficios incluidos:", "Benefícios incluídos:"),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF94A3B8),
                        )
                        planToActivate.features.filter { it.included }.forEach { feature ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Outlined.Check,
                                    contentDescription = null,
                                    tint = Color(0xFF10B981),
                                    modifier = Modifier.size(15.dp),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = feature.label,
                                    fontSize = 13.sp,
                                    color = Color.White,
                                )
                            }
                        }
                    }
                }

                // Selector de método de pago
                if (planToActivate.priceMonthlyArs > 0) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = healthText("Método de pago:", "Forma de pagamento:"),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF94A3B8),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFF1E293B),
                                border = BorderStroke(1.5.dp, Color(0xFF0EA5E9)),
                                modifier = Modifier.weight(1f),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.MonetizationOn,
                                        contentDescription = null,
                                        tint = Color(0xFF38BDF8),
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = healthText("Pix / Transferencia", "Pix / Transferência"),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color.White,
                                    )
                                }
                            }

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFF1E293B),
                                border = BorderStroke(1.dp, Color(0xFF334155)),
                                modifier = Modifier.weight(1f),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.CreditCard,
                                        contentDescription = null,
                                        tint = Color(0xFF94A3B8),
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = healthText("Tarjeta Déb./Créd.", "Cartão Déb./Créd."),
                                        fontSize = 12.sp,
                                        color = Color(0xFFCBD5E1),
                                    )
                                }
                            }
                        }
                    }
                }

                // Botón de confirmación con estado de carga
                Button(
                    onClick = {
                        // Request plan activation from a real backend owner only.
                        // Do not change tier/credits or claim success before server confirmation.
                        onActivatePlan?.invoke(planToActivate.tierKey)
                        selectedPlanForActivation = null
                    },
                    enabled = !isActivating && onActivatePlan != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = 50.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = planToActivate.color),
                ) {
                    if (isActivating) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = healthText("Activando plan...", "Ativando plano..."),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                    } else {
                        Text(
                            text = when {
                                onActivatePlan == null -> healthText("Activación no disponible", "Ativação indisponível")
                                planToActivate.priceMonthlyArs > 0 -> healthText("Confirmar y Activar", "Confirmar e Ativar")
                                else -> healthText("Confirmar Plan Gratuito", "Confirmar Plano Gratuito")
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                        )
                    }
                }

                Text(
                    text = healthText(
                        es = "Podés cancelar o cambiar tu plan en cualquier momento sin penalizaciones.",
                        pt = "Você pode cancelar ou alterar seu plano a qualquer momento sem multas.",
                    ),
                    fontSize = 11.sp,
                    color = Color(0xFF64748B),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

// ── Secondary Components ──────────────────────────────────────────────────────

@Composable
private fun BenefitCategoryCard(
    category: BenefitCategoryItem,
    currentCredits: Int,
    hasEnoughCredits: Boolean,
) {
    val isPortuguese = isPortugueseUi()
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(category.accentColor.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = category.icon,
                            contentDescription = null,
                            tint = category.accentColor,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            text = category.title,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = if (isPortuguese) {
                                "Valor particular ref.: ${formatLocalizedReferenceAmount(category.referenceMarketPriceArs, true)}"
                            } else {
                                "Valor particular ref.: ${formatArs(category.referenceMarketPriceArs)}"
                            },
                            fontSize = 11.sp,
                            color = AuTextTertiary,
                        )
                    }
                }

                // Costo en créditos
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = category.accentColor.copy(alpha = 0.12f),
                ) {
                    Text(
                        text = "${category.creditsCost} pts",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = category.accentColor,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }

            Text(
                text = category.description,
                fontSize = 12.sp,
                color = AuTextSecondary,
                lineHeight = 17.sp,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = category.examples,
                    fontSize = 11.sp,
                    color = AuTextTertiary,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                if (hasEnoughCredits) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color(0xFF064E3B),
                        border = BorderStroke(1.dp, Color(0xFF059669)),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF34D399),
                                modifier = Modifier.size(12.dp),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = healthText("Alcanza con tu saldo", "Disponível no seu saldo"),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF34D399),
                            )
                        }
                    }
                } else {
                    val missingCredits = category.creditsCost - currentCredits
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = AuSurfaceHover,
                    ) {
                        Text(
                            text = healthText("Faltan $missingCredits pts", "Faltam $missingCredits pts"),
                            fontSize = 10.sp,
                            color = AuTextTertiary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailedPlanCard(
    plan: ReservePlan,
    isCurrentPlan: Boolean,
    onSelect: () -> Unit,
) {
    val isPortuguese = isPortugueseUi()
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = if (isCurrentPlan) AuSurfaceHover else AuSurface,
        border = BorderStroke(
            width = if (isCurrentPlan) 2.dp else 1.dp,
            color = if (isCurrentPlan) plan.color else AuBorder,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header del plan
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(plan.color.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = plan.icon,
                        contentDescription = null,
                        tint = plan.color,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = plan.name,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        if (plan.badgeText != null) {
                            Spacer(Modifier.width(8.dp))
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = plan.color.copy(alpha = 0.15f),
                            ) {
                                Text(
                                    text = plan.badgeText,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = plan.color,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                )
                            }
                        }
                    }
                    Text(
                        text = formatLocalizedMonthlyPlanPrice(plan = plan, isPortuguese = isPortuguese),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (plan.priceMonthlyArs > 0) plan.color else AuTextSecondary,
                    )
                }

                if (isCurrentPlan) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = plan.color.copy(alpha = 0.15f),
                    ) {
                        Text(
                            text = healthText("Plan Activo", "Plano Ativo"),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = plan.color,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }
                }
            }

            Text(
                text = plan.summaryText,
                fontSize = 12.sp,
                color = AuTextSecondary,
                lineHeight = 17.sp,
            )

            // Features list
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                plan.features.forEach { feature ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (feature.included) Icons.Outlined.CheckCircle else Icons.Outlined.Lock,
                            contentDescription = null,
                            tint = if (feature.included) plan.color else AuTextTertiary.copy(alpha = 0.35f),
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = feature.label,
                            fontSize = 12.sp,
                            color = if (feature.included) AuTextPrimary else AuTextTertiary.copy(alpha = 0.5f),
                        )
                    }
                }
            }

            // CTA Button
            if (!isCurrentPlan) {
                Button(
                    onClick = onSelect,
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = plan.color),
                ) {
                    Text(
                        text = if (plan.priceMonthlyArs > 0) {
                            if (isPortuguese) "Ativar Plano ${plan.name}" else "Activar Plan ${plan.name}"
                        } else {
                            healthText("Elegir Plan Gratuito", "Escolher Plano Gratuito")
                        },
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.width(6.dp))
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                }
            } else {
                OutlinedButton(
                    onClick = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = 44.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, plan.color.copy(alpha = 0.4f)),
                ) {
                    Text(
                        text = healthText("Tu membresía actual", "Sua assinatura atual"),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = plan.color,
                    )
                }
            }
        }
    }
}

@Composable
private fun FaqAccordionItem(
    question: String,
    answer: String,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(
                role = Role.Button,
                onClick = { expanded = !expanded },
            )
            .padding(vertical = 6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = question,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = AuTextPrimary,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = if (expanded) "▲" else "▼",
                fontSize = 10.sp,
                color = AuTextTertiary,
            )
        }
        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Text(
                text = answer,
                fontSize = 12.sp,
                color = AuTextSecondary,
                lineHeight = 17.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}
