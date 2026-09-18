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
import androidx.compose.runtime.rememberCoroutineScope
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
import kotlinx.coroutines.delay
import com.autamedica.android.util.CountryContext
import kotlinx.coroutines.launch
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
    val priceFormatted: String? = null,
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
    val referenceMarketPriceFormatted: String? = null,
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

val defaultReservePlansBrazil: List<ReservePlan> = listOf(
    ReservePlan(
        name = "Gratuito",
        tierKey = "free",
        priceMonthlyArs = 0,
        monthlyCredits = 0,
        maxCapCredits = 0,
        badgeText = null,
        summaryText = "Acesso à plataforma de telemedicina e receitas digitais para consultas avulsas.",
        color = Color(0xFF64748B),
        icon = Icons.Outlined.HealthAndSafety,
        features = listOf(
            PlanFeature("Prontuário eletrônico no seu celular", true),
            PlanFeature("Receita médica com assinatura digital", true),
            PlanFeature("Pagamento avulso por consulta", true),
            PlanFeature("1 consulta médica mensal inclusa", false),
            PlanFeature("Reserva de créditos acumulativos", false),
            PlanFeature("Prioridade no pronto atendimento virtual 24/7", false),
        ),
        priceFormatted = "Grátis para sempre",
    ),
    ReservePlan(
        name = "Cuidado",
        tierKey = "cuidado",
        priceMonthlyArs = 0,
        monthlyCredits = 22,
        maxCapCredits = 600,
        badgeText = "Mais Escolhido",
        summaryText = "1 teleconsulta médica mensal inclusa e Reserva de Saúde: se não usar sua consulta, acumule créditos para especialistas, exames e farmácia.",
        color = Color(0xFF0EA5E9),
        icon = Icons.Outlined.MedicalServices,
        features = listOf(
            PlanFeature("1 teleconsulta médica clínica mensal inclusa", true),
            PlanFeature("Use ou Acumule: +22 créditos/mês sem uso", true),
            PlanFeature("Resgate em especialistas, exames e farmácia", true),
            PlanFeature("Receitas e atestados digitais ilimitados", true),
            PlanFeature("Prioridade no pronto atendimento 24/7", true),
            PlanFeature("Pagamento instantâneo via Pix ou Cartão", true),
        ),
        isPopular = true,
        priceFormatted = "R$ 49,90 / mês via Pix",
    ),
    ReservePlan(
        name = "Familiar",
        tierKey = "familiar",
        priceMonthlyArs = 0,
        monthlyCredits = 66,
        maxCapCredits = 1_800,
        badgeText = "Cobertura Compartilhada",
        summaryText = "Proteção médica para até 4 membros da família com reserva unificada e créditos compartilhados.",
        color = Color(0xFF8B5CF6),
        icon = Icons.Outlined.FamilyRestroom,
        features = listOf(
            PlanFeature("Cobertura integral para até 4 dependentes", true),
            PlanFeature("Consultas mensais para toda a família", true),
            PlanFeature("Reserva unificada: acumulam juntos todo mês", true),
            PlanFeature("Resgate flexível para qualquer membro", true),
            PlanFeature("Prontuário separado por integrante", true),
            PlanFeature("Atendimento prioritário contínuo", true),
        ),
        priceFormatted = "R$ 129,90 / mês via Pix",
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

val defaultBenefitCategoriesBrazil: List<BenefitCategoryItem> = listOf(
    BenefitCategoryItem(
        categoryKey = "specialists",
        title = "Consultas com Especialistas",
        creditsCost = 100,
        referenceMarketPriceArs = 0,
        description = "Cardiologia, dermatologia, ortopedia, ginecologia e mais de 20 especialidades na rede credenciada.",
        examples = "Teleconsultas de 30 minutos ou presenciais sem coparticipação.",
        icon = Icons.Outlined.MedicalServices,
        accentColor = Color(0xFF0EA5E9),
        referenceMarketPriceFormatted = "R$ 150,00",
    ),
    BenefitCategoryItem(
        categoryKey = "labs",
        title = "Exames e Laboratórios",
        creditsCost = 60,
        referenceMarketPriceArs = 0,
        description = "Painéis completos de rotina preventiva e análises clínicas em laboratórios credenciados.",
        examples = "Hemograma completo, perfil lipídico, glicemia e urina.",
        icon = Icons.Outlined.Biotech,
        accentColor = Color(0xFF10B981),
        referenceMarketPriceFormatted = "R$ 90,00",
    ),
    BenefitCategoryItem(
        categoryKey = "pharmacy",
        title = "Farmácia e Medicamentos",
        creditsCost = 55,
        referenceMarketPriceArs = 0,
        description = "Vouchers diretos para medicamentos de uso contínuo em redes de farmácias parceiras.",
        examples = "Anti-hipertensivos, hipoglicemiantes e fármacos ambulatoriais essenciais.",
        icon = Icons.Outlined.Medication,
        accentColor = Color(0xFF8B5CF6),
        referenceMarketPriceFormatted = "R$ 80,00",
    ),
)

// ── Pure Helper Functions ─────────────────────────────────────────────────────

fun calculateEstimatedArs(credits: Int): Int = credits * 150

fun calculateEstimatedBrl(credits: Int): Double = credits * 1.5

fun calculateProgressFraction(credits: Int, maxCap: Int): Float {
    if (maxCap <= 0) return 0f
    return (credits.toFloat() / maxCap.toFloat()).coerceIn(0f, 1f)
}

fun formatCredits(credits: Int, locale: Locale = CountryContext.getLocale()): String =
    NumberFormat.getNumberInstance(locale).format(credits)

fun formatArs(amount: Int): String {
    val format = NumberFormat.getCurrencyInstance(CountryContext.ARGENTINA_LOCALE)
    format.maximumFractionDigits = 0
    return format.format(amount)
}

fun formatBrl(amount: Double): String {
    val format = NumberFormat.getCurrencyInstance(CountryContext.BRAZIL_LOCALE)
    return format.format(amount)
}

fun formatEstimatedValue(credits: Int, isBrazil: Boolean): String {
    return if (isBrazil) {
        formatBrl(calculateEstimatedBrl(credits))
    } else {
        formatArs(calculateEstimatedArs(credits))
    }
}

fun getReservePlans(isBrazil: Boolean): List<ReservePlan> =
    if (isBrazil) defaultReservePlansBrazil else defaultReservePlans

fun getBenefitCategories(isBrazil: Boolean): List<BenefitCategoryItem> =
    if (isBrazil) defaultBenefitCategoriesBrazil else defaultBenefitCategories

fun getPlanByTier(tierKey: String, isBrazil: Boolean = false): ReservePlan {
    val plans = getReservePlans(isBrazil)
    return plans.find { it.tierKey == tierKey.lowercase() } ?: plans.first()
}

// ── Main Screen Composable ────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthReserveDetailScreen(
    subscriptionTier: String = "cuidado",
    benefitBalanceCredits: Int = 22,
    maxCapCredits: Int = 600,
    countryCode: String? = null,
    userPhone: String? = null,
    onBack: () -> Unit = {},
    onActivatePlan: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val isBrazil = remember(countryCode, userPhone) {
        CountryContext.isBrazil(countryCode = countryCode, phoneNumber = userPhone)
    }
    val plans = remember(isBrazil) { getReservePlans(isBrazil) }
    val categories = remember(isBrazil) { getBenefitCategories(isBrazil) }

    var activeTier by remember(subscriptionTier) { mutableStateOf(subscriptionTier.lowercase()) }
    var currentCredits by remember(benefitBalanceCredits) { mutableIntStateOf(benefitBalanceCredits) }
    var currentMaxCap by remember(maxCapCredits) { mutableIntStateOf(if (maxCapCredits > 0) maxCapCredits else 600) }
    var selectedPlanForActivation by remember { mutableStateOf<ReservePlan?>(null) }
    var isActivating by remember { mutableStateOf(false) }
    var activationSuccessMessage by remember { mutableStateOf<String?>(null) }
    var simulatedMonths by remember { mutableIntStateOf(3) }

    val coroutineScope = rememberCoroutineScope()
    val currentPlan = getPlanByTier(activeTier, isBrazil)
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
                            text = if (isBrazil) "Reserva de Saúde" else "Reserva de Salud",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = if (isBrazil) "Planos Transparentes & Benefícios Acumuláveis" else "Planes Transparentes & Beneficios Acumulables",
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
                            contentDescription = if (isBrazil) "Voltar" else "Regresar al inicio",
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
                                    text = if (isBrazil) "Plano atualizado!" else "¡Plan actualizado!",
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
                                    contentDescription = if (isBrazil) "Fechar" else "Cerrar",
                                    tint = Color.White.copy(alpha = 0.7f),
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }
            }

            // ── 1. Hero Card: Créditos Acumulados & Estimación ────────
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
                                        text = if (isBrazil) "RESERVA DE SAÚDE" else "RESERVA DE SALUD",
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
                                    text = if (isBrazil) "Plano ${currentPlan.name}" else "Plan ${currentPlan.name}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = currentPlan.color,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                            }
                        }

                        // Contador de créditos y equivalente
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Bottom,
                            ) {
                                Column {
                                    Text(
                                        text = formatCredits(currentCredits),
                                        fontSize = 42.sp,
                                        fontWeight = FontWeight.Light,
                                        color = Color.White,
                                        letterSpacing = (-1).sp,
                                    )
                                    Text(
                                        text = if (isBrazil) "AUTA Créditos disponíveis" else "AUTA Créditos disponibles",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF94A3B8),
                                    )
                                }

                                Column(horizontalAlignment = Alignment.End) {
                                    val estimatedValue = formatEstimatedValue(currentCredits, isBrazil)
                                    Text(
                                        text = estimatedValue,
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF38BDF8),
                                    )
                                    Text(
                                        text = if (isBrazil) "equiv. estimado na rede" else "equiv. estimado en red",
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
                                    text = "0 créditos",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                )
                                Text(
                                    text = if (isBrazil) "Teto acumulável: ${formatCredits(currentMaxCap)} pts" else "Tope acumulable: ${formatCredits(currentMaxCap)} pts",
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
                                text = if (isBrazil) {
                                    "💡 Se você estiver com a saúde em dia e não usar sua consulta no mês, seu dinheiro não é perdido: ele se transforma em créditos de saúde para especialistas, exames e farmácia."
                                } else {
                                    "💡 Si estás sano y no usás tu consulta del mes, tu dinero no se pierde: se transforma en créditos de salud para especialistas, análisis clínicos y farmacia."
                                },
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
                        text = if (isBrazil) "Onde você pode usar seus créditos?" else "¿Dónde podés usar tus créditos?",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = if (isBrazil) "Resgate diretamente na rede credenciada sem coparticipação surpresa." else "Canjeá directamente en la red de prestadores sin copagos sorpresa.",
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
                    isBrazil = isBrazil,
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
                                text = if (isBrazil) "Simulador: Quanto você pode acumular?" else "Simulador: ¿Cuánto podés acumular?",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                        Text(
                            text = if (isBrazil) {
                                "Escolha os meses sem consultas para projetar seus créditos acumulados:"
                            } else {
                                "Elegí el tiempo de meses saludables sin consultas para proyectar tus créditos acumulados:"
                            },
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
                                            text = if (months == 1) (if (isBrazil) "1 mês" else "1 mes") else "$months meses",
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
                                        text = "+$projectedCredits AUTA Créditos",
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White,
                                    )
                                    val projectedValueText = formatEstimatedValue(projectedCredits, isBrazil)
                                    Text(
                                        text = "Equivalente estimado: $projectedValueText",
                                        fontSize = 12.sp,
                                        color = Color(0xFF38BDF8),
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = Color(0x330EA5E9),
                                ) {
                                    Text(
                                        text = if (isBrazil) {
                                            when {
                                                projectedCredits >= 100 -> "Especialistas liberados"
                                                projectedCredits >= 60 -> "Check-up liberado"
                                                projectedCredits >= 55 -> "Farmácia liberada"
                                                else -> "Acumulação inicial"
                                            }
                                        } else {
                                            when {
                                                projectedCredits >= 100 -> "Especialistas desbloqueados"
                                                projectedCredits >= 60 -> "Check-up desbloqueado"
                                                projectedCredits >= 55 -> "Farmacia desbloqueada"
                                                else -> "Acumulación inicial"
                                            }
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

            // ── 4. Comparador de Planes ──────────
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = if (isBrazil) "Comparador de Planos" else "Comparador de Planes",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = if (isBrazil) {
                            "Transparência total. Troque ou cancele sua assinatura quando quiser."
                        } else {
                            "Transparencia total. Cambiá o cancelá tu suscripción cuando lo decidas."
                        },
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
                    isBrazil = isBrazil,
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
                            text = if (isBrazil) "Perguntas Frequentes" else "Preguntas Frecuentes",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )

                        if (isBrazil) {
                            FaqAccordionItem(
                                question = "O que acontece se eu não usar minha consulta no mês?",
                                answer = "Se você tem o Plano Cuidado ou Familiar, acumula automaticamente 22 AUTA Créditos na sua Reserva de Saúde para resgatar depois em especialistas, exames ou farmácia.",
                            )
                            FaqAccordionItem(
                                question = "Os créditos expiram?",
                                answer = "Eles têm validade de até 24 meses enquanto mantiver sua assinatura ativa, permitindo acumular até o teto do seu plano.",
                            )
                            FaqAccordionItem(
                                question = "Como resgato meus créditos?",
                                answer = "Diretamente pelo app: escolha o serviço na rede credenciada, gere seu voucher digital e apresente na consulta ou farmácia.",
                            )
                            FaqAccordionItem(
                                question = "Posso cancelar meu plano quando quiser?",
                                answer = "Sim, 100% online e a qualquer momento, sem fidelidade nem multas.",
                            )
                        } else {
                            FaqAccordionItem(
                                question = "¿Qué sucede si no uso mi consulta en el mes?",
                                answer = "Si tenés el Plan Cuidado o Familiar, sumás automáticamente 22 AUTA Créditos a tu Reserva de Salud para canjear más adelante en especialistas, análisis clínicos o farmacia.",
                            )
                            FaqAccordionItem(
                                question = "¿Los créditos vencen?",
                                answer = "Tienen una vigencia de hasta 24 meses mientras mantengas tu suscripción activa, permitiéndote acumular hasta el tope fijado por tu plan.",
                            )
                            FaqAccordionItem(
                                question = "¿Cómo canjeo mis créditos?",
                                answer = "Directamente desde la app: seleccionás el servicio deseado en la red conveniada, generás tu voucher digital e ingresás a la consulta o presentás el código en farmacia.",
                            )
                            FaqAccordionItem(
                                question = "¿Puedo cancelar mi plan cuando quiera?",
                                answer = "Sí, 100% online y en cualquier momento sin períodos mínimos de permanencia ni penalizaciones.",
                            )
                        }
                    }
                }
            }

            // Disclaimer Legal
            item {
                Text(
                    text = if (isBrazil) {
                        "A AutaMedica é uma plataforma tecnológica de telemedicina e programa de benefícios em rede credenciada. Não é operadora de plano de saúde nem seguradora."
                    } else {
                        "AutaMedica es una plataforma tecnológica de telemedicina y programa de beneficios en red conveniada. No es una empresa de medicina prepaga ni aseguradora."
                    },
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
                            text = if (isBrazil) "Ativar Plano ${planToActivate.name}" else "Activar Plan ${planToActivate.name}",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        )
                        val priceLabel = if (isBrazil) {
                            planToActivate.priceFormatted ?: "Grátis"
                        } else {
                            if (planToActivate.priceMonthlyArs > 0) "${formatArs(planToActivate.priceMonthlyArs)} / mes" else "Gratis para siempre"
                        }
                        Text(
                            text = priceLabel,
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
                            contentDescription = if (isBrazil) "Fechar modal" else "Cerrar modal",
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
                            text = if (isBrazil) "Benefícios inclusos:" else "Beneficios incluidos:",
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
                if (planToActivate.tierKey != "free") {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = if (isBrazil) "Forma de pagamento:" else "Método de pago:",
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
                                        text = if (isBrazil) "Pix Instantâneo" else "Pix / Transferencia",
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
                                        text = if (isBrazil) "Cartão de Crédito" else "Tarjeta Déb./Créd.",
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
                        isActivating = true
                        coroutineScope.launch {
                            delay(500) // Feedback de transición fluida
                            onActivatePlan(planToActivate.tierKey)
                            activeTier = planToActivate.tierKey
                            if (planToActivate.tierKey == "cuidado") {
                                currentMaxCap = 600
                                if (currentCredits == 0) currentCredits = 22
                            } else if (planToActivate.tierKey == "familiar") {
                                currentMaxCap = 1800
                                if (currentCredits == 0) currentCredits = 66
                            }
                            isActivating = false
                            selectedPlanForActivation = null
                            activationSuccessMessage = if (isBrazil) {
                                "Você ativou o Plano ${planToActivate.name}. Sua Reserva de Saúde já está acumulando benefícios."
                            } else {
                                "Has activado el Plan ${planToActivate.name}. Tu Reserva de Salud ya está sumando beneficios."
                            }
                        }
                    },
                    enabled = !isActivating,
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
                        Text(if (isBrazil) "Ativando plano..." else "Activando plan...", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    } else {
                        val ctaLabel = if (isBrazil) {
                            if (planToActivate.tierKey != "free") "Assinar Plano Cuidado com Pix" else "Confirmar Plano Gratuito"
                        } else {
                            if (planToActivate.priceMonthlyArs > 0) "Confirmar y Activar" else "Confirmar Plan Gratuito"
                        }
                        Text(
                            text = ctaLabel,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                        )
                    }
                }

                Text(
                    text = if (isBrazil) {
                        "Você pode cancelar ou alterar seu plano a qualquer momento sem custos adicionais."
                    } else {
                        "Podés cancelar o cambiar tu plan en cualquier momento sin penalizaciones."
                    },
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
    isBrazil: Boolean = false,
) {
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
                        val refPriceText = if (category.referenceMarketPriceFormatted != null) {
                            category.referenceMarketPriceFormatted
                        } else {
                            formatArs(category.referenceMarketPriceArs)
                        }
                        Text(
                            text = "Valor particular ref.: $refPriceText",
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
                                text = if (isBrazil) "Disponível com seu saldo" else "Alcanza con tu saldo",
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
                            text = if (isBrazil) "Faltam $missingCredits pts" else "Faltan $missingCredits pts",
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
    isBrazil: Boolean = false,
) {
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
                    val priceDisplay = plan.priceFormatted ?: if (plan.priceMonthlyArs > 0) "${formatArs(plan.priceMonthlyArs)} / mes" else "Gratis"
                    Text(
                        text = priceDisplay,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (plan.tierKey != "free") plan.color else AuTextSecondary,
                    )
                }

                if (isCurrentPlan) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = plan.color.copy(alpha = 0.15f),
                    ) {
                        Text(
                            text = if (isBrazil) "Plano Ativo" else "Plan Activo",
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
                    val ctaText = if (isBrazil) {
                        if (plan.tierKey != "free") "Assinar Plano ${plan.name} com Pix" else "Escolher Plano Gratuito"
                    } else {
                        if (plan.priceMonthlyArs > 0) "Activar Plan ${plan.name}" else "Elegir Plan Gratuito"
                    }
                    Text(
                        text = ctaText,
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
                        text = if (isBrazil) "Sua assinatura atual" else "Tu membresía actual",
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
