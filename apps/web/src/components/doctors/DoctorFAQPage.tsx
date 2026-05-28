/**
 * DoctorFAQPage.tsx - Centro de ayuda del portal médico AutaMedica.
 * Preguntas frecuentes sobre pacientes, recetas, videollamadas y agenda.
 */
"use client";

import {
  Search,
  HelpCircle,
  ChevronDown,
  Users,
  Pill,
  Video,
  Calendar,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Clock,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Lock,
  Activity,
  Compass,
  Bookmark,
  Info,
  CreditCard
} from "lucide-react";

interface FAQItem {
  id: string;
  category: "patients" | "prescriptions" | "calls" | "agenda" | "billing";
  question: string;
  answer: React.ReactNode;
  tags: string[];
}

export function DoctorFAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "patients" | "prescriptions" | "calls" | "agenda" | "billing">("all");
  const [openItem, setOpenItem] = useState<string | null>("atender-externo");

  const categories = [
    { id: "all", label: "Todas las guías", icon: HelpCircle },
    { id: "patients", label: "Pacientes", icon: Users },
    { id: "prescriptions", label: "Recetas", icon: Pill },
    { id: "calls", label: "Consultas", icon: Video },
    { id: "agenda", label: "Agenda", icon: Calendar },
    { id: "billing", label: "Cobros y Planes", icon: CreditCard },
  ];

  const faqItems = useMemo<FAQItem[]>(() => [
    {
      id: "atender-externo",
      category: "patients",
      question: "¿Cómo hago si quiero atender a un paciente de mi consultorio privado? (Paciente Externo)",
      tags: ["paciente externo", "sin cuenta", "nuevo paciente", "registro", "manual", "formulario"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            En AutaMedica podés atender a tus pacientes de siempre de forma directa, sin obligarlos a registrarse o bajarse aplicaciones antes de la consulta. Completás sus datos básicos y reciben su receta digital firmada al instante para que la usen en cualquier farmacia.
          </p>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-am-doctor-500" />
              UBICACIÓN EN LA INTERFAZ Y PASO A PASO
            </h5>
            <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-3 pl-1">
              <li>
                <span className="font-semibold text-am-surface-900">Botonera Superior:</span> En el menú lateral izquierdo, hacé clic en <span className="font-semibold text-am-doctor-600">"Mis medicamentos"</span> (Recetas) y presioná el botón <span className="font-semibold text-am-surface-900">"Nueva Receta"</span> arriba a la derecha.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Activación del Formulario:</span> En el buscador del modal, elegí la opción <span className="font-semibold text-am-doctor-600">"+ Atender Paciente Externo / Registrar Nuevo Paciente"</span>. Esto desplegará un formulario muy simple.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Datos para evitar rebotes en farmacia (Garantía de compra):</span>
                <ul className="list-disc list-inside ml-5 mt-1.5 space-y-1.5 text-am-surface-500">
                  <li><span className="font-medium text-am-surface-700">Nombre completo:</span> Tal como figura en su credencial o documento.</li>
                  <li><span className="font-medium text-am-surface-700">DNI o CUIL:</span> Ingresá el número de corrido, sin puntos ni guiones.</li>
                  <li><span className="font-medium text-am-surface-700">Domicilio real completo:</span> Indispensable para que la farmacia le acepte la orden y valide su cobertura médica sin contratiempos.</li>
                  <li><span className="font-medium text-am-surface-700">Contacto de envío:</span> Su número de WhatsApp o correo electrónico para que reciba la receta digital inmediatamente al salir de tu consulta.</li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Firma de Emisión:</span> Completá el medicamento o el examen, y hacé clic en el botón principal inferior <span className="font-semibold text-am-doctor-600">"Firmar y Emitir"</span>. El sistema hace el resto.
              </li>
            </ol>
          </div>

          <div className="pt-2">
            <h6 className="text-[11px] font-bold uppercase tracking-widest text-am-surface-400 mb-3">Flujo del Paciente Externo</h6>
            <div className="flex flex-col sm:flex-row gap-3 items-center text-center">
              <div className="w-full sm:w-1/3 rounded-xl border border-am-surface-200 bg-white p-3 shadow-sm">
                <span className="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-am-surface-100 text-am-surface-600 text-xs font-bold mb-1">1</span>
                <p className="text-[11px] font-bold text-am-surface-800 uppercase">Carga de Datos</p>
                <p className="text-[10px] text-am-surface-500 mt-1">Ingresás DNI/Domicilio en el modal</p>
              </div>
              <div className="hidden sm:block text-am-surface-300">
                <ChevronRight className="h-5 w-5" />
              </div>
              <div className="w-full sm:w-1/3 rounded-xl border border-am-surface-200 bg-white p-3 shadow-sm">
                <span className="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-am-surface-100 text-am-surface-600 text-xs font-bold mb-1">2</span>
                <p className="text-[11px] font-bold text-am-surface-800 uppercase">Registro Seguro</p>
                <p className="text-[10px] text-am-surface-500 mt-1">Se da de alta al paciente de forma privada</p>
              </div>
              <div className="hidden sm:block text-am-surface-300">
                <ChevronRight className="h-5 w-5" />
              </div>
              <div className="w-full sm:w-1/3 rounded-xl border border-am-doctor-100 bg-am-doctor-50/30 p-3 shadow-sm">
                <span className="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-am-doctor-100 text-am-doctor-700 text-xs font-bold mb-1">3</span>
                <p className="text-[11px] font-bold text-am-doctor-700 uppercase">Envío al Paciente</p>
                <p className="text-[10px] text-am-doctor-600 mt-1">Recibe su receta por WhatsApp / Email</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "paciente-otros-medicos",
      category: "patients",
      question: "¿Este paciente externo después estará disponible para los otros médicos?",
      tags: ["privacidad", "padron", "historial clinico", "portabilidad", "secreto", "ley 25.326"],
      answer: (
        <div className="space-y-4 text-sm leading-relaxed text-am-surface-600">
          <p>
            <span className="font-semibold text-am-surface-900">No.</span> Tu consultorio es sagrado. Respetamos rigurosamente el Secreto Médico y la confidencialidad de tus pacientes.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 space-y-2">
              <span className="font-bold text-am-surface-800 text-xs flex items-center gap-1">
                <Lock className="h-4 w-4 text-am-surface-500" /> PRIVACIDAD DE TU CONSULTORIO:
              </span>
              <p className="text-xs text-am-surface-600 leading-relaxed">
                El paciente que cargues queda enlazado de forma exclusiva a tu perfil médico. Sus datos de contacto, evoluciones, ficha clínica e historial de recetas no aparecen en las búsquedas ni pantallas de ningún otro profesional de la plataforma.
              </p>
            </div>
            
            <div className="rounded-xl border border-am-doctor-100 bg-am-doctor-50/40 p-4 space-y-2">
              <span className="font-bold text-am-doctor-700 text-xs flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-am-doctor-600" /> PORTAL DEL PACIENTE:
              </span>
              <p className="text-xs text-am-surface-600 leading-relaxed">
                Si tu paciente decide abrirse una cuenta global en AutaMedica para gestionar sus turnos o consultar a otros especialistas, podrá hacerlo de forma libre. Sin embargo, <span className="font-bold text-am-surface-900">tus notas SOAP, evoluciones e historial de consultas contigo permanecen 100% privados y bajo tu llave</span>, siendo totalmente invisibles para otros médicos.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "paciente-decidir-otro",
      category: "patients",
      question: "¿Puede el paciente que yo traje a la plataforma decidir atenderse con otro médico?",
      tags: ["libre eleccion", "competencia", "pacientes", "portabilidad", "decreto 345/2024"],
      answer: (
        <div className="space-y-4 text-sm leading-relaxed text-am-surface-600">
          <p>
            <span className="font-semibold text-am-surface-900">Sí, la decisión es siempre del paciente.</span> Respetamos plenamente su derecho a elegir libremente a su profesional. Cada persona es dueña de su salud y puede programar consultas con cualquier especialista de la cartilla cuando lo desee.
          </p>
          <p>
            Nuestra filosofía es acompañar al paciente de la forma más transparente posible, garantizando su libertad de elección bajo la Ley de Derechos del Paciente N° 26.529.
          </p>
          <div className="rounded-xl bg-am-surface-50 border border-am-surface-200 p-4 flex gap-3 items-start">
            <Info className="h-5 w-5 text-am-surface-400 shrink-0 mt-0.5" />
            <div>
              <h6 className="text-xs font-bold text-am-surface-800 uppercase">Seguridad de tu práctica privada</h6>
              <p className="text-xs text-am-surface-500 mt-1 leading-relaxed">
                Aunque tu paciente decida consultar a otro colega, tu evolución clínica y notas de consultorio privado no se comparten con el nuevo médico de forma automática. El sistema protege tu criterio profesional y la confidencialidad de tus sesiones bajo estricta reserva.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "emitir-receta",
      category: "prescriptions",
      question: "¿Cómo emito una receta digital oficial paso a paso y qué datos se requieren?",
      tags: ["receta digital", "prescripción", "firmar", "vademecum", "farmalink", "cie-10"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            <span className="font-semibold text-am-surface-900">Es sumamente directo y seguro.</span> Todo el proceso está integrado con la red nacional de farmacias **Farmalink (IMED)**. Esto asegura que cuando emitís una receta, tu paciente pueda presentarse en cualquier farmacia física del país, dar su DNI o el código QR desde su celular, y obtener sus medicamentos y descuentos en el acto.
          </p>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-am-doctor-500" />
              DATOS REQUERIDOS Y UBICACIÓN EN LA INTERFAZ
            </h5>
            <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-3.5 pl-1">
              <li>
                <span className="font-semibold text-am-surface-900">Botón Nueva Receta:</span> Hacé clic en <span className="font-semibold text-am-doctor-600">"Recetas"</span> en la barra lateral izquierda y luego presioná el botón <span className="font-semibold text-am-surface-900">"Nueva Receta"</span> arriba a la derecha. (Si estás en una videollamada, la pestaña de recetas está en el panel derecho de la pantalla).
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Buscador de Medicamentos (Vadémecum):</span> En el campo **"Fármaco / Principio Activo"**, escribí las primeras letras y seleccioná la sugerencia automática del vademécum nacional oficial.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Campos de Dosificación Obligatorios:</span>
                <ul className="list-disc list-inside ml-5 mt-1 space-y-1 text-am-surface-500">
                  <li><span className="font-medium text-am-surface-700">Dosis / Concentración:</span> ej. 500 mg.</li>
                  <li><span className="font-medium text-am-surface-700">Frecuencia de toma:</span> ej. cada 8 horas.</li>
                  <li><span className="font-medium text-am-surface-700">Duración del tratamiento:</span> ej. 7 días.</li>
                  <li><span className="font-medium text-am-surface-700">Cantidad de cajas / unidades:</span> ej. 1 caja.</li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Diagnóstico Asociado (CIE-10):</span> Buscá y asociá el código o diagnóstico en el campo correspondiente. Es obligatorio para que las obras sociales aprueben la cobertura.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Asistencia con IA (Guía para el Paciente):</span> Hacé clic en el botón **"Generar guía con IA"** para que Gemini redacte de forma automática pautas de autocuidado sencillas y advertencias útiles para el paciente.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Firma de Emisión:</span> Presioná **"Firmar y Emitir"**. El sistema valida tu matrícula contra REFEPS/SISA, firma digitalmente la receta y la envía al instante.
              </li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: "que-son-borradores",
      category: "prescriptions",
      question: "¿Qué son los borradores (Drafts) de recetas y para qué sirven?",
      tags: ["borradores", "drafts", "guardar", "firmar mas tarde", "edicion"],
      answer: (
        <div className="space-y-3 text-sm leading-relaxed text-am-surface-600">
          <p>
            Un **borrador** es un borrador clínico: una indicación pre-cargada que guardás temporalmente para trabajar de forma organizada durante el día, pero que **todavía no tiene validez legal ni ha sido firmada oficialmente**.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
            <div className="p-4 bg-red-50/60 border border-red-100 rounded-xl space-y-1.5 text-red-900">
              <span className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-red-800">
                <AlertTriangle className="h-4 w-4" /> LO QUE DEBÉS SABER:
              </span>
              <ul className="list-disc list-inside space-y-1.5 text-am-surface-600 pl-1">
                <li>No le llega al paciente ni se envía a las farmacias.</li>
                <li>No consume firmas digitales de tu cupo profesional.</li>
                <li>Podés editarla, cambiar la dosis o borrarla libremente sin restricciones.</li>
              </ul>
            </div>
            
            <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-1.5 text-emerald-900">
              <span className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> TU ALIADA EN LA ORGANIZACIÓN:
              </span>
              <ul className="list-disc list-inside space-y-1.5 text-am-surface-600 pl-1">
                <li><span className="font-semibold text-am-surface-800">Pre-carga inteligente:</span> Podés cargar las recetas de tus turnos programados del día antes de empezar tu jornada.</li>
                <li><span className="font-semibold text-am-surface-800">Firma en un segundo:</span> Durante la videollamada, tras revisar la evolución del paciente, la firmás y emitís con un solo toque.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "donde-llega-paciente",
      category: "prescriptions",
      question: "¿Dónde y cómo le llega la receta emitida al paciente?",
      tags: ["envio", "notificación", "whatsapp", "email", "pdf", "qr"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            Al momento de firmar y emitir, AutaMedica genera un PDF digital firmado y homologado con su correspondiente código QR. Para tu comodidad, **el sistema se encarga de hacérsela llegar al paciente al instante y de manera 100% gratuita** por dos canales directos:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-4 rounded-xl border border-am-surface-200 p-4 bg-white shadow-sm hover:border-am-surface-300 transition-all">
              <div className="p-3 rounded-xl bg-green-50 text-green-600 shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.742.002-2.602-1.01-5.05-2.85-6.89C16.643 2.133 14.191 1.12 11.59 1.12 6.155 1.12 1.73 5.49 1.727 10.862c-.001 1.724.46 3.41 1.332 4.888l-.991 3.62 3.731-.969c1.4.767 2.923 1.171 4.545 1.173H11.59z"/>
                </svg>
              </div>
              <div>
                <h5 className="text-xs font-bold text-am-surface-800 uppercase tracking-wide">WhatsApp Oficial de AutaMedica</h5>
                <p className="text-xs text-am-surface-500 leading-relaxed mt-1">
                  El paciente recibe un WhatsApp inmediato desde nuestra línea oficial verificada. Contiene el enlace directo y seguro para descargar el PDF clínico y presentar el código QR en la farmacia, junto con la Guía de Autocuidado con IA redactada con términos claros y amigables.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-am-surface-200 p-4 bg-white shadow-sm hover:border-am-surface-300 transition-all">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-am-surface-800 uppercase tracking-wide">Correo Electrónico</h5>
                <p className="text-xs text-am-surface-500 leading-relaxed mt-1">
                  Si registraste un email, le llega un correo institucional desde contacto@autamedica.com con el PDF digital firmado adjunto, listo para imprimir o validar legalmente.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "llamada-telemedicina",
      category: "calls",
      question: "¿Cómo hago una llamada de telemedicina? (Uso del Consultorio Virtual y Controles)",
      tags: ["llamada", "video", "sala", "entrar a consulta", "adhoc", "instantanea", "controles"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            Podés realizar videollamadas seguras de forma muy simple a través de tu Dashboard:
          </p>

          <div className="space-y-3">
            <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50">
              <h5 className="text-xs font-bold text-am-surface-800 uppercase flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-700 font-bold text-xs">A</span>
                Para Turnos de tu Agenda (Programados):
              </h5>
              <p className="text-xs text-am-surface-600 leading-relaxed mt-1.5">
                <span className="font-semibold text-am-surface-900">Ubicación:</span> En el centro de tu Dashboard de Doctor, verás la sección **"Turnos de Hoy"**. Al llegar la hora acordada, aparecerá un botón que dice **"Entrar a Consulta"**. Al pulsarlo, ingresás a la sala y le llega un WhatsApp al paciente avisándole que ya estás listo.
              </p>
            </div>

            <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50">
              <h5 className="text-xs font-bold text-am-surface-800 uppercase flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-am-surface-200 text-am-surface-700 font-bold text-xs">B</span>
                Videollamada Instantánea (Ad-Hoc - Sin Turno Previo):
              </h5>
              <p className="text-xs text-am-surface-600 leading-relaxed mt-1.5">
                <span className="font-semibold text-am-surface-900">Ubicación:</span> Arriba a la derecha en tu Dashboard, ubicá el panel **"Consulta Instantánea / Iniciar Videollamada Ad-Hoc"**. Seleccioná al paciente de la lista y presioná el botón **"Iniciar videollamada"**. El sistema le envía un WhatsApp inmediato con el link para conectarse al instante con un toque.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-am-doctor-500" />
              PANTALLA DE VIDEOLLAMADA Y CONTROLES CLÍNICOS
            </h5>
            <p className="text-xs text-am-surface-600 leading-relaxed">
              La videollamada está pensada para que atiendas al paciente sin perder contacto visual mientras completás los datos médicos:
            </p>
            <ul className="list-disc list-inside space-y-2 text-xs text-am-surface-500 pl-1">
              <li><span className="font-semibold text-am-surface-800">Panel Izquierdo (Pantalla de Video):</span> Imagen en vivo del paciente y barra flotante con botones para silenciar micrófono, apagar cámara, compartir pantalla y colgar.</li>
              <li><span className="font-semibold text-am-surface-800">Panel Derecho (Historia Clínica):</span> Pestañas integradas para evolucionar sin cerrar el video:
                <ul className="list-disc list-inside ml-5 mt-1 space-y-1 text-am-surface-500">
                  <li><span className="font-medium text-am-surface-700">SOAP:</span> Carga de notas clínicas y asistencia con IA.</li>
                  <li><span className="font-medium text-am-surface-700">Recetas:</span> Emisión y vademécum de recetas en el acto.</li>
                  <li><span className="font-medium text-am-surface-700">Estudios:</span> Petición de laboratorios e imágenes clínicas.</li>
                  <li><span className="font-medium text-am-surface-700">Historial:</span> Consulta ágil de antecedentes médicos.</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "plataforma-da-pacientes",
      category: "agenda",
      question: "¿La plataforma me da pacientes o tengo que traer a los míos? (Modelo Híbrido)",
      tags: ["pacientes nuevos", "cartilla", "marketplace", "agenda", "honorarios"],
      answer: (
        <div className="space-y-3 text-sm leading-relaxed text-am-surface-600">
          <p>
            AutaMedica funciona bajo un **modelo híbrido flexible** diseñado para potenciar tu consultorio:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="rounded-xl border border-am-surface-200 bg-white p-4 shadow-sm space-y-2">
              <span className="h-2 w-12 rounded-full bg-am-surface-900 block" />
              <h5 className="font-bold text-am-surface-800 text-xs uppercase tracking-wide">1. Tu Consultorio Privado (Sin costo)</h5>
              <p className="text-xs text-am-surface-600 leading-relaxed">
                Mudá a tus pacientes habituales compartiendo tu enlace personalizado. Atendelos por videollamada y emitiles recetas con firma oficial homologada de forma 100% gratuita para centralizar tu práctica profesional en un solo lugar.
              </p>
            </div>

            <div className="rounded-xl border border-am-doctor-100 bg-am-doctor-50/10 p-4 shadow-sm space-y-2">
              <span className="h-2 w-12 rounded-full bg-am-doctor-500 block" />
              <h5 className="font-bold text-am-doctor-800 text-xs uppercase tracking-wide">2. Nuevos pacientes de la Cartilla</h5>
              <p className="text-xs text-am-surface-600 leading-relaxed">
                Todos los días, miles de personas buscan especialistas en AutaMedica. Si configurás tus horarios de disponibilidad pública en la sección **"Citas" y luego "Configurar Horarios"**, aparecerás automáticamente en la cartilla pública para que nuevos pacientes agenden consultas y abonen tus honorarios particulares de forma directa.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "recomendar-medico",
      category: "agenda",
      question: "¿Cómo hago para que AutaMedica me recomiende en la cartilla pública?",
      tags: ["ranking", "algoritmo", "recomendacion", "reputacion", "sla", "asistencia"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            La cartilla de AutaMedica posiciona a los profesionales en base a un **Compromiso de confianza mutua**. El sistema premia de manera orgánica tu constancia y las buenas prácticas en la atención de los pacientes:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-am-surface-800">Matrícula validada y al día</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Tener tu credencial aprobada y conectada a SISA/REFEPS. Es el requisito de ingreso indispensable para aparecer en el listado público.</p>
              </div>
            </div>
            
            <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-am-doctor-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-am-surface-800">Respetar tus citas</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Cuidar los turnos que aceptás. Evitar cancelaciones sobre la hora ayuda a sostener una comunidad responsable.</p>
              </div>
            </div>
            
            <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-am-surface-800">Puntualidad en videollamadas</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Estar a tiempo en la sala virtual. Iniciar la consulta en el horario acordado es clave para mantener tu perfil en los primeros puestos.</p>
              </div>
            </div>
            
            <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-am-doctor-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-am-surface-800">Evolución y pautas de autocuidado</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Guardar tu reporte SOAP al finalizar la consulta y enviarle las guías con IA al paciente para su tranquilidad suma puntos de visibilidad.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "solicitar-examenes",
      category: "agenda",
      question: "¿Puedo solicitar exámenes y estudios complementarios? ¿Cómo lo hago?",
      tags: ["estudios", "examenes", "laboratorio", "radiografia", "imagenes", "orden medica", "solicitud"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            **Sí.** Podés prescribir solicitudes de estudios y exámenes complementarios (laboratorios, imágenes, cardiología, etc.) con firma digital. Tienen validez legal completa para presentarse ante cualquier obra social, prepaga o centro de diagnóstico del país.
          </p>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-am-doctor-500" />
              PASO A PASO EN LA INTERFAZ PARA EMITIR UNA SOLICITUD DE ESTUDIO
            </h5>
            <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-3 pl-1">
              <li>
                <span className="font-semibold text-am-surface-900">Ubicación del Botón:</span> Durante la videollamada con el paciente, en el panel clínico lateral derecho, hacé clic en la pestaña <span className="font-semibold text-am-doctor-600">"Estudios"</span> y presioná el botón <span className="font-semibold text-am-surface-900">"Nueva Solicitud"</span> (o desde el Dashboard, en el menú del paciente hacé clic en **"Solicitar Estudio"**). Esto abrirá una ventana emergente.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Selección de Categoría:</span> Hacé clic en la categoría adecuada: **Laboratorio**, **Imágenes**, **Cardiología** u **Otros**.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Carga de prácticas:</span> Escribí el examen deseado (ej. *"Ecografía abdominal"* o *"Hemograma completo"*) y hacé clic en **"Agregar"**. Podés sumar múltiples prácticas en una sola orden.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Diagnóstico Presuntivo (Requisito Obligatorio):</span> Completá el campo de Diagnóstico presuntivo (buscando el código o diagnóstico libre) para que las coberturas médicas aprueben la práctica del paciente.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Firma y Envío:</span> Presioná **"Emitir orden"**. El sistema estampa tu firma digital y envía el PDF al instante por WhatsApp y Email al paciente en tiempo real.
              </li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: "que-escribir-soap",
      category: "calls",
      question: "¿Qué debo escribir en el SOAP? ¿Cómo me ayuda el Secretario Clínico con IA?",
      tags: ["soap", "reporte clinico", "copilot", "gemini", "ia", "historia clinica", "notas"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            El registro de la evolución clínica en AutaMedica utiliza el formato estándar **SOAP** (Subjetivo, Objetivo, Análisis, Plan). Pero no tenés que perder tiempo de contacto visual redactando en vivo:
          </p>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50/50 p-4 space-y-3">
            <h6 className="text-xs font-bold text-am-surface-800 uppercase tracking-wide flex items-center gap-1.5">
              <Bookmark className="h-4 w-4 text-am-surface-500" />
              Estructura simplificada del SOAP:
            </h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
                <span className="font-bold text-blue-600 uppercase text-[10px]">S - Subjetivo (Lo que refiere tu paciente)</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Su motivo de consulta, síntomas expresados, antecedentes y malestares referidos.</p>
              </div>
              <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
                <span className="font-bold text-emerald-600 uppercase text-[10px]">O - Objetivo (Lo que observás)</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Tus observaciones visuales clínicas, signos vitales informados o estudios previos.</p>
              </div>
              <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
                <span className="font-bold text-purple-600 uppercase text-[10px]">A - Análisis (Tu diagnóstico)</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">Tu criterio profesional y la asociación diagnóstica oficial (CIE-10).</p>
              </div>
              <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
                <span className="font-bold text-amber-600 uppercase text-[10px]">P - Plan Clínico (El tratamiento)</span>
                <p className="text-am-surface-500 mt-1 leading-relaxed">La indicación médica: medicamentos, dosis, estudios solicitados y pautas de alarma.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-am-doctor-500" />
              TU SECRETARIO CLÍNICO CON IA
            </h5>
            <p className="text-xs text-am-surface-600 leading-relaxed">
              AutaMedica cuenta con un transcriptor y redactor asistido por IA para que te concentres por completo en escuchar al paciente en lugar de tipear en el teclado:
            </p>
            <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-2.5 pl-1">
              <li>
                <span className="font-semibold text-am-surface-900">Apuntes Informales (Notas rápidas):</span> Durante la videollamada, usá el cuadro de texto **"Notas rápidas del doctor"** para tipear palabras sueltas, ideas telegráficas o abreviaturas rápidas (ej: *"pcte 40a, dolor de cabeza frontal, TA 140/90, indico reposo"*).
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Generar con un clic:</span> Al colgar la videollamada, presioná el botón **"Generar reporte SOAP con IA"** justo debajo de tus apuntes.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Redacción médica automática:</span> En un segundo, la IA interpreta tu borrador rápido y la consulta y pre-llena de forma impecable las 4 secciones del SOAP con una redacción médica profesional de alta calidad.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Revisión y guardado:</span> Ajustás cualquier detalle del texto generado si lo creés necesario y guardás la historia clínica.
              </li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: "agenda-eventos",
      category: "agenda",
      question: "¿La plataforma agenda automáticamente los eventos? ¿Qué son los eventos?",
      tags: ["eventos", "bloqueos", "agenda", "calendario", "citas", "guardias"],
      answer: (
        <div className="space-y-3 text-sm leading-relaxed text-am-surface-600">
          <p>
            **Sí, la sincronización es inmediata.** Tu tiempo y tu agenda son sagrados: si registrás o bloqueás una hora en tu calendario, ese espacio desaparece automáticamente de tu disponibilidad de turnos para que ningún paciente reserve por error.
          </p>
          
          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 space-y-3">
            <h5 className="text-xs font-bold text-am-surface-800 uppercase flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-am-doctor-600" />
              ¿Qué es un bloqueo personal (Evento)?
            </h5>
            <p className="text-xs text-am-surface-600 leading-relaxed">
              Un **evento** es un bloqueo de tiempo personal o profesional externo a AutaMedica que registrás en tu calendario (ej. *"Guardia hospitalaria"*, *"Congreso"*, *"Trámite personal"*, *"Descanso"*). Al guardarlo, prevenís reservas en horarios comprometidos.
            </p>
            
            <span className="font-bold text-am-surface-800 text-xs block uppercase tracking-wider">Cómo se crea en tu agenda:</span>
            <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-2 pl-1">
              <li>Dirigite a la sección <span className="font-semibold text-am-surface-900">"Citas"</span> (calendario) en la barra lateral izquierda.</li>
              <li>Hacé clic y arrastrá sobre el bloque de horas que querés reservar o bloquear.</li>
              <li>En la ventana emergente, elegí la opción <span className="font-semibold text-am-surface-900">"Crear Evento / Bloquear Horario"</span>.</li>
              <li>Escribí una referencia rápida y presioná <span className="font-semibold text-am-surface-900">"Guardar"</span>.</li>
            </ol>
            
            <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-100 leading-relaxed font-semibold">
              Sincronización automática de cartilla: Al guardar este bloqueo personal, el sistema elimina instantáneamente la disponibilidad de esos turnos de tu perfil de cartilla pública. Esto evita que los pacientes agenden consultas virtuales en momentos donde estarás comprometido, previniendo la molestia de tener que cancelar turnos manualmente.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "vincular-mercadopago",
      category: "billing",
      question: "¿Cómo cobro mis consultas particulares y cómo vinculo MercadoPago?",
      tags: ["mercadopago", "cobros", "honorarios", "billetera", "vincular", "cuenta", "pagos"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            Cobrar tus honorarios de videoconsultas en AutaMedica es sumamente ordenado. Las transacciones se procesan de forma segura a través de tu cuenta vinculada de MercadoPago, permitiéndote centralizar tus ingresos profesionales.
          </p>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-am-doctor-500" />
              PASO A PASO PARA VINCULAR TU CUENTA
            </h5>
            <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-3 pl-1">
              <li>
                <span className="font-semibold text-am-surface-900">Sección de Facturación:</span> En tu Dashboard de Doctor, dirigite a <span className="font-semibold text-am-surface-900">"Mi Cuenta"</span> (arriba a la derecha) y seleccioná la pestaña <span className="font-semibold text-am-doctor-600">"Facturación"</span>.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Conexión Segura:</span> Hacé clic en el botón principal <span className="font-semibold text-am-surface-900">"Vincular cuenta de MercadoPago"</span>.
              </li>
              <li>
                <span className="font-semibold text-am-surface-900">Autorización:</span> El sistema te redirigirá automáticamente al portal seguro de MercadoPago para ingresar tus credenciales y autorizar la sincronización en un solo clic. ¡Y listo!
              </li>
            </ol>
          </div>

          <p className="text-xs text-am-doctor-700 bg-am-doctor-50/30 p-4 rounded-xl border border-am-doctor-100 leading-relaxed font-semibold">
            Procesamiento y liberación: Al completarse la consulta, el pago del paciente se procesa a través de la plataforma. La disponibilidad final del dinero en tu cuenta de MercadoPago dependerá de los plazos estándar de clearing y liberación que tengas configurados en tu perfil de MercadoPago.
          </p>
        </div>
      )
    },
    {
      id: "comisiones-plataforma",
      category: "billing",
      question: "¿AutaMedica me cobra comisiones sobre mis consultas particulares?",
      tags: ["comisiones", "cobros", "honorarios", "costo", "mercadopago", "descuentos"],
      answer: (
        <div className="space-y-3 text-sm leading-relaxed text-am-surface-600">
          <p>
            <span className="font-semibold text-am-surface-900">Sí.</span> Para sostener la orquestación del Consultorio Virtual, la infraestructura de seguridad clínica, la asistencia de IA y el soporte médico constante, <span className="font-semibold text-am-surface-900">AutaMedica retiene una comisión del 15% por cada videoconsulta realizada</span> en el marketplace.
          </p>
          <div className="rounded-xl bg-am-surface-50 border border-am-surface-200 p-4 flex gap-3 items-start mt-2">
            <Info className="h-5 w-5 text-am-surface-400 shrink-0 mt-0.5" />
            <div>
              <h6 className="text-xs font-bold text-am-surface-800 uppercase">Aranceles de la pasarela de pagos (MercadoPago)</h6>
              <p className="text-xs text-am-surface-500 mt-1 leading-relaxed">
                Adicionalmente, por cada cobro con tarjeta, MercadoPago aplica una tasa fija de procesamiento financiero del <span className="font-semibold text-am-surface-700">4%</span> sobre la transacción. Esto cubre el costo del procesamiento seguro de cobro bancario de la tarjeta del paciente.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "suscripciones-planes",
      category: "billing",
      question: "¿Cómo funcionan las suscripciones de planes (Pro y Premium)?",
      tags: ["suscripción", "planes", "pago", "debito", "pro", "premium", "ia", "copilot", "badges"],
      answer: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-am-surface-600">
            El uso básico de AutaMedica para atender a tus pacientes privados de siempre y emitir recetas digitales es **100% gratuito**. Sin embargo, si querés potenciar tu consulta, podés suscribirte a nuestros planes avanzados:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-am-surface-200 bg-white p-4 shadow-sm space-y-2">
              <span className="h-2 w-12 rounded-full bg-am-doctor-500 block" />
              <h5 className="font-bold text-am-surface-800 text-xs uppercase tracking-wide">Planes Destacados (Pro / Premium)</h5>
              <p className="text-xs text-am-surface-500 leading-relaxed">
                Habilitan el uso ilimitado de nuestro **Secretario Clínico con IA** (transcripciones completas de SOAP y generación automática de pautas de autocuidado), priorizan tu perfil en la cartilla pública con badges destacados (estrellas/escudos) e incrementan tu exposición en las búsquedas de los pacientes.
              </p>
            </div>

            <div className="rounded-xl border border-am-surface-200 bg-white p-4 shadow-sm space-y-2">
              <span className="h-2 w-12 rounded-full bg-am-surface-900 block" />
              <h5 className="font-bold text-am-surface-800 text-xs uppercase tracking-wide">Pago Recurrente Seguro</h5>
              <p className="text-xs text-am-surface-500 leading-relaxed">
                Las suscripciones se abonan de forma mensualizada mediante débito automático en tu tarjeta a través de la pasarela segura de MercadoPago. Podés pausar, cambiar de plan o volver al plan gratuito cuando quieras, sin contratos de permanencia ni cobros ocultos.
              </p>
            </div>
          </div>
        </div>
      )
    }
  ], []);

  // Filtrado de preguntas frecuentes
  const filteredFaqs = useMemo(() => {
    return faqItems.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.category === activeCategory;
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [faqItems, activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-am-bg py-8 px-4 sm:px-6 lg:px-8 text-am-text-primary">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Banner de cabecera */}
        <div className="relative overflow-hidden rounded-xl bg-am-surface-900 px-6 py-12 shadow-xl sm:px-12 text-white">
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-am-doctor-500/10 px-3 py-1 text-xs font-bold text-am-doctor-400 border border-am-doctor-500/20">
              <Sparkles className="h-3.5 w-3.5" />
              Instructivo Clínico Operativo
            </span>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-white leading-tight">
              ¿Cómo te ayudamos hoy, <span className="font-semibold text-am-doctor-400">Doctor/a</span>?
            </h1>
            <p className="text-sm text-am-surface-300 leading-relaxed font-light">
              Respuestas claras sobre el uso del Consultorio Virtual de telemedicina, flujo legal de recetas electrónicas en farmacias, protección de datos personales e integración de la asistencia clínica con IA.
            </p>
          </div>
        </div>

        {/* Barra de búsqueda */}
        <div className="relative shadow-sm rounded-xl">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-am-text-tertiary">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Escribí tu consulta (ej. paciente externo, vademecum, SOAP, bloquear agenda...)"
            className="w-full rounded-xl border border-am-border bg-white py-4 pl-12 pr-4 text-sm text-am-text-primary placeholder:text-am-text-tertiary focus:outline-none focus:ring-2 focus:ring-am-doctor-500/20 focus:border-am-doctor-500 shadow-sm transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-semibold text-am-text-tertiary hover:text-am-text-secondary transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Pestañas de navegación por categorías */}
        <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id as "all" | "patients" | "prescriptions" | "calls" | "agenda" | "billing");
                  setOpenItem(null);
                }}
                className={`flex items-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all shadow-sm ${
                  isActive
                    ? "bg-am-surface-900 text-am-doctor-400 border border-am-surface-800 shadow-inner"
                    : "bg-white border border-am-border text-am-text-secondary hover:border-am-border-hover hover:text-am-text-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Listado de guías / acordeones colapsables */}
        <div className="space-y-4">
          {filteredFaqs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-am-border bg-white p-12 text-center text-am-text-tertiary">
              <HelpCircle className="h-10 w-10 mx-auto text-am-text-tertiary mb-3" />
              <p className="text-sm font-semibold">No encontramos guías que coincidan con tu búsqueda.</p>
              <p className="text-xs text-am-text-tertiary mt-1">Intentá buscar con otros términos generales como "receta" o "SOAP".</p>
            </div>
          ) : (
            filteredFaqs.map((item) => {
              const isOpen = openItem === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden bg-white shadow-sm ${
                    isOpen ? "border-am-border ring-2 ring-am-surface-100" : "border-am-border hover:border-am-border-hover hover:shadow"
                  }`}
                >
                  <button
                    onClick={() => setOpenItem(isOpen ? null : item.id)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 font-semibold text-am-text-primary text-sm sm:text-base transition-colors hover:bg-am-surface-hover"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-2 w-2 rounded-full shrink-0 ${
                        item.category === "patients" ? "bg-blue-500" :
                        item.category === "prescriptions" ? "bg-emerald-500" :
                        item.category === "calls" ? "bg-purple-500" :
                        item.category === "agenda" ? "bg-amber-500" : "bg-sky-500"
                      }`} />
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-am-text-tertiary transition-transform duration-200 shrink-0 ${
                        isOpen ? "rotate-180 text-am-doctor-500" : ""
                      }`}
                    />
                  </button>
                  
                  {isOpen && (
                    <div className="px-6 pb-6 pt-3 border-t border-am-border bg-white animate-in slide-in-from-top-4 duration-300">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer informativo */}
        <div className="rounded-xl border border-am-border bg-white p-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-am-doctor-50 text-am-doctor-600 shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1 space-y-1.5 text-center sm:text-left">
            <h4 className="text-sm font-bold text-am-text-primary uppercase tracking-wide">Validación legal permanente</h4>
            <p className="text-xs text-am-text-secondary leading-relaxed font-light">
              AutaMedica realiza una validación continua contra la base de prestadores de la Superintendencia de Servicios de Salud (SSS) y del Registro Federal de Profesionales de la Salud (REFEPS). Todas tus emisiones cumplen plenamente con la Ley Nacional de Receta Digital N° 27.553.
            </p>
          </div>
          <div className="shrink-0">
            <a
              href="/doctors/perfil"
              className="inline-flex items-center gap-1.5 rounded-xl bg-am-surface-900 px-4 py-3 text-xs font-bold text-white transition-all hover:bg-am-surface-700"
            >
              <span>Ver mi Matrícula</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
