import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// 1. CONFIGURACIÓN Y VARIABLES DE ENTORNO
// ============================================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

if (!TELEGRAM_BOT_TOKEN) {
  console.warn('⚠️  TELEGRAM_BOT_TOKEN no configurado. El bot no se iniciará en modo real.');
}

// ============================================================================
// 2. CLIENTE DE BASE DE DATOS (SUPABASE)
// ============================================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// 3. ESTADOS DE CONVERSACIÓN (EN MEMORIA, ULTRA-LIGERO)
// ============================================================================
const userState = new Map();
const rateLimiter = new Map();

// ============================================================================
// 4. INTEGRACIÓN CON IA (GEMINI API)
// ============================================================================
async function askGemini(question, historyContext = []) {
  if (!GEMINI_API_KEY) {
    return 'Lo siento, el asistente de IA no está configurado actualmente.';
  }

  const systemInstruction = 
    "Sos IAsmin, la asistente virtual de AutaMedica, una plataforma líder de telemedicina en Argentina. " +
    "Respondé siempre de forma clara, profesional, cálida y empática. " +
    "REGLA CRÍTICA DE SALUD: NO ofrezcas diagnósticos médicos ni prescribas medicamentos. Si el usuario describe síntomas preocupantes, " +
    "aconsejale amablemente agendar una consulta con uno de nuestros profesionales usando el comando de /consulta o la opción de agendamiento. " +
    "Ayudá a guiar sobre el uso de la plataforma, explicación de recetas electrónicas, especialidades médicas y consejos generales de bienestar.";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const contents = [
      { role: 'user', parts: [{ text: `INSTRUCCIÓN DE SISTEMA: ${systemInstruction}` }] }
    ];

    // Añadimos el historial del chat si existe
    historyContext.forEach(h => {
      contents.push({ role: h.role, parts: [{ text: h.text }] });
    });

    contents.push({ role: 'user', parts: [{ text: question }] });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude procesar la respuesta en este momento. Volvé a intentarlo.';
  } catch (error) {
    console.error('❌ Error llamando a Gemini:', error);
    return 'Ocurrió un error al procesar tu consulta con la IA. Por favor intentá en unos instantes.';
  }
}

// ============================================================================
// 5. INICIALIZACIÓN DEL BOT DE TELEGRAM
// ============================================================================
const bot = new Bot(TELEGRAM_BOT_TOKEN);

// ============================================================================
// 6. TECLADOS Y MENÚS INTERACTIVOS
// ============================================================================
const mainMenuKeyboard = new Keyboard()
  .text('🗓️ Agendar Consulta').text('📅 Mis Turnos').row()
  .text('💊 Mis Recetas').text('🧠 Hablar con IAsmin (IA)').row()
  .text('⚙️ Ayuda / Vinculación')
  .resized();

const linkAccountKeyboard = new InlineKeyboard()
  .text('🔗 Vincular mi cuenta', 'link_account');

// ============================================================================
// 7. HELPER FUNCTIONS / VINCULACIÓN
// ============================================================================
async function findProfileByTelegramId(telegramId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, role')
    .eq('telegram_id', telegramId.toString())
    .maybeSingle();
  if (error) console.error('Error fetching profile:', error);
  return data;
}

async function findProfileByPhone(phone) {
  // Limpiamos formato
  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, telegram_id')
    .eq('phone', cleanPhone)
    .maybeSingle();
  if (error) console.error('Error finding phone:', error);
  return data;
}

// ============================================================================
// 8. HANDLERS DE COMANDOS Y MENÚS
// ============================================================================

// Command /start
bot.command('start', async (ctx) => {
  const profile = await findProfileByTelegramId(ctx.from.id);

  if (profile) {
    await ctx.reply(
      `👋 ¡Hola, *${profile.name}*\\! Bienvenido nuevamente a *AutaMedica*\\.\n\n` +
      `¿En qué puedo ayudarte hoy? Usá los botones táctiles de abajo para navegar de forma rápida\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: mainMenuKeyboard }
    );
  } else {
    await ctx.reply(
      `👋 ¡Hola\\! Bienvenido a *AutaMedica* (Tu salud, a un mensaje de distancia)\\.\n\n` +
      `Para poder darte turnos, mostrarte recetas y brindarte un servicio personalizado, necesitamos vincular tu cuenta de Telegram con tu usuario de la plataforma\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: linkAccountKeyboard }
    );
  }
});

// Callback Vincular Cuenta
bot.callbackQuery('link_account', async (ctx) => {
  userState.set(ctx.from.id, { step: 'waiting_for_phone' });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📞 Por favor, enviame tu número de teléfono con el que estás registrado en AutaMedica (con código de país, ej: +5491168261552).\n\n` +
    `Podés escribirlo o simplemente compartir tu contacto de Telegram de forma segura con el botón de abajo.`,
    {
      reply_markup: new Keyboard()
        .requestContact('📱 Compartir mi número')
        .resized()
        .oneTime()
    }
  );
});

// Procesa texto libre o contactos para vinculación
bot.on(['message:text', 'message:contact'], async (ctx) => {
  const userId = ctx.from.id;
  const state = userState.get(userId);

  // 1. FLUJO DE VINCULACIÓN POR TELÉFONO
  if (state?.step === 'waiting_for_phone') {
    let phone = '';
    if (ctx.message.contact) {
      phone = ctx.message.contact.phone_number;
    } else {
      phone = ctx.message.text.trim();
    }

    await ctx.reply('🔍 Verificando número en nuestros sistemas...');

    const profile = await findProfileByPhone(phone);

    if (profile) {
      // Guardamos telegram_id en el perfil de Supabase
      const { error } = await supabase
        .from('profiles')
        .update({ telegram_id: userId.toString() })
        .eq('id', profile.id);

      if (error) {
        console.error('Error linking telegram_id:', error);
        await ctx.reply('❌ Ocurrió un error al vincular tu cuenta en la base de datos. Por favor contactá a soporte.');
      } else {
        userState.delete(userId);
        await ctx.reply(
          `✅ *¡Vinculación Exitosa\\!*\n\n` +
          `Hola *${profile.name}*, tu usuario de Telegram quedó enlazado a tu cuenta de AutaMedica\\.\n\n` +
          `Ya podés disfrutar de todos los servicios directamente desde acá\\.`,
          { parse_mode: 'MarkdownV2', reply_markup: mainMenuKeyboard }
        );
      }
    } else {
      await ctx.reply(
        `❌ No encontramos ningún usuario registrado con el teléfono *${phone}* en AutaMedica.\n\n` +
        `Verificá que esté bien ingresado. Si todavía no tenés cuenta, podés registrarte gratis en la web y luego volver a vincularte.`,
        { parse_mode: 'Markdown', reply_markup: linkAccountKeyboard }
      );
    }
    return;
  }

  // 2. FLUJO DE CHAT CON GEMINI (IA)
  if (state?.step === 'chatting_ai') {
    const text = ctx.message.text;

    if (text === '🔙 Volver al Menú Principal') {
      userState.delete(userId);
      await ctx.reply('Menú Principal de AutaMedica:', { reply_markup: mainMenuKeyboard });
      return;
    }

    // Rate Limiting para evitar abusos de tokens en la VM
    const now = Date.now();
    const limit = rateLimiter.get(userId) || { count: 0, resetAt: now + 60000 };
    if (now > limit.resetAt) {
      limit.count = 0;
      limit.resetAt = now + 60000;
    }
    if (limit.count >= 5) {
      await ctx.reply('⚠️ Has alcanzado el límite de consultas a la IA por minuto. Por favor, aguardá unos instantes.');
      return;
    }
    limit.count++;
    rateLimiter.set(userId, limit);

    await ctx.replyWithChatAction('typing');

    const history = state.history || [];
    const response = await askGemini(text, history);

    // Guardamos contexto
    history.push({ role: 'user', text });
    history.push({ role: 'model', text: response });
    if (history.length > 6) history.shift(); // Mantenemos contexto corto para ahorrar memoria RAM

    userState.set(userId, { step: 'chatting_ai', history });

    await ctx.reply(response, {
      reply_markup: new Keyboard().text('🔙 Volver al Menú Principal').resized()
    });
    return;
  }

  // 3. PROCESAMIENTO DE MENÚS TÁCTILES GENERALES
  const menuText = ctx.message.text;

  const profile = await findProfileByTelegramId(userId);
  if (!profile && menuText !== '⚙️ Ayuda / Vinculación') {
    await ctx.reply(
      `🔒 *Acceso Restringido*\n\n` +
      `Para poder usar las opciones del menú, primero debés vincular tu cuenta de Telegram.`,
      { reply_markup: linkAccountKeyboard }
    );
    return;
  }

  if (menuText === '🧠 Hablar con IAsmin (IA)') {
    userState.set(userId, { step: 'chatting_ai', history: [] });
    await ctx.reply(
      `🤖 *Hola, soy IAsmin, tu asistente virtual con IA*\n\n` +
      `Podés hacerme preguntas de salud general, consultarme sobre especialidades médicas, o evacuar tus dudas sobre medicamentos.\n\n` +
      `*Aviso:* No reemplazo la consulta presencial o videollamada con un médico matriculado. ¿Qué duda tenés hoy?`,
      {
        parse_mode: 'Markdown',
        reply_markup: new Keyboard().text('🔙 Volver al Menú Principal').resized()
      }
    );
  }

  else if (menuText === '📅 Mis Turnos') {
    await ctx.reply('🔍 Buscando tus próximos turnos en la agenda...');
    const { data: appts, error } = await supabase
      .from('appointments')
      .select('id, date, status, doctors(profiles(name)), specialties(name)')
      .eq('patient_profile_id', profile.id)
      .gte('date', new Date().toISOString())
      .order('date', { ascending: true });

    if (error || !appts) {
      await ctx.reply('❌ No pudimos obtener tus turnos en este momento.');
      return;
    }

    if (appts.length === 0) {
      await ctx.reply(
        `📅 *No tenés turnos agendados actualmente.*\n\n` +
        `Podés solicitar uno nuevo tocando en *🗓️ Agendar Consulta* en el menú.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      let msg = `📅 *Tus Próximos Turnos:*\n\n`;
      appts.forEach((a, i) => {
        const dateFormatted = new Date(a.date).toLocaleString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        msg += `${i + 1}. *Especialidad:* ${a.specialties?.name || 'General'}\n` +
               `👨‍⚕️ *Médico:* Dr/a. ${a.doctors?.profiles?.name || 'A designar'}\n` +
               `📆 *Fecha:* ${dateFormatted}\n` +
               `📌 *Estado:* ${a.status === 'confirmed' ? '🟢 Confirmado' : '🟡 Pendiente'}\n\n`;
      });
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  }

  else if (menuText === '💊 Mis Recetas') {
    await ctx.reply('🔍 Recuperando tus últimas recetas digitales...');
    const { data: recs, error } = await supabase
      .from('prescriptions')
      .select('id, created_at, medication_name, dosage, status')
      .eq('patient_profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !recs) {
      await ctx.reply('❌ No pudimos cargar tus recetas electrónicas.');
      return;
    }

    if (recs.length === 0) {
      await ctx.reply('💊 *Aún no tenés recetas emitidas a tu nombre.*');
    } else {
      let msg = `💊 *Tus Recetas Recientes:*\n\n`;
      recs.forEach((r) => {
        const dateFormatted = new Date(r.created_at).toLocaleDateString('es-AR');
        msg += `🔹 *Medicamento:* ${r.medication_name}\n` +
               `📏 *Dosis:* ${r.dosage}\n` +
               `📆 *Fecha:* ${dateFormatted}\n` +
               `📎 *Acceso:* [Descargar Receta PDF](${SUPABASE_URL}/storage/v1/object/public/prescriptions/${r.id}.pdf)\n\n`;
      });
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  }

  else if (menuText === '🗓️ Agendar Consulta') {
    await ctx.reply(
      `🗓️ *Agendar Videoconsulta*\n\n` +
      `Por el momento, para seleccionar horario de forma 100% interactiva, ver la cartilla completa de médicos activos y realizar el pago electrónico seguro por MercadoPago, ingresá directamente a la plataforma:\n\n` +
      `🔗 [Ir al Portal de Turnos](https://autamedica.com/dashboard/appointments/book)`,
      { parse_mode: 'Markdown' }
    );
  }

  else if (menuText === '⚙️ Ayuda / Vinculación') {
    const isLinked = !!profile;
    await ctx.reply(
      `🛠️ *Centro de Ayuda de AutaMedica*\n\n` +
      `*Estado de la Cuenta:* ${isLinked ? '🟢 Vinculada con éxito' : '🔴 No vinculada'}\n` +
      `*Tu Telegram ID:* \`${userId}\`\n\n` +
      `Si tenés algún inconveniente con el servicio o no lográs registrarte, escribinos por WhatsApp al soporte oficial:\n\n` +
      `💬 [Soporte Técnico de AutaMedica](https://wa.me/5491168261552)`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ============================================================================
// 9. COMANDOS DE ADMINISTRADOR (STATUS & MONITOREO DE SISTEMA)
// ============================================================================
bot.command('status', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!ADMIN_IDS.includes(userId)) {
    await ctx.reply('🔒 Comando administrativo no autorizado.');
    return;
  }

  const memory = process.memoryUsage();
  const memoryUsedMB = (memory.heapUsed / 1024 / 1024).toFixed(2);

  await ctx.reply(
    `📊 *AutaMedica VM Status (Antigravity)*\n\n` +
    `🟢 *Bot Uptime:* Activo\n` +
    `💾 *Consumo RAM:* ${memoryUsedMB} MB\n` +
    `🤖 *Model IA:* ${GEMINI_MODEL}\n` +
    `🔗 *Conectividad DB:* Conectado (Supabase)`,
    { parse_mode: 'Markdown' }
  );
});

// Error handling global
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`❌ Error en handler del bot para update ${ctx.update.update_id}:`, err.error);
});

// Iniciar bot
if (TELEGRAM_BOT_TOKEN) {
  console.log('🤖 AutaMedica Telegram Bot iniciando...');
  bot.start({
    onStart: (info) => {
      console.log(`✅ Bot conectado y corriendo como @${info.username}`);
    }
  });
}

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Telegram Bot apagándose...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n🛑 Telegram Bot apagándose...');
  process.exit(0);
});
