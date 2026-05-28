import React from "react";
import {
  Compass,
  Lock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Activity,
  Bookmark,
  Brain,
  Calendar,
  Info,
  ChevronRight,
  Clock
} from "lucide-react";

export interface FAQItem {
  id: string;
  category: "patients" | "prescriptions" | "calls" | "agenda" | "billing";
  question: string;
  answer: React.ReactNode;
  tags: string[];
}

export const faqItems: FAQItem[] = [
  {
    id: "atender-externo",
    category: "patients",
    question: "¿Cómo hago si quiero atender a un paciente de mi consultorio privado? (Paciente Externo)",
    tags: ["paciente externo", "sin cuenta", "nuevo paciente", "registro", "manual", "formulario"],
    answer: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-am-surface-600">
          Para atender a un paciente que no está previamente registrado en la plataforma, podés cargarlo directamente en el sistema de manera rápida. Esto te permite registrar sus datos esenciales al instante y despachar sus recetas y órdenes sin obligarlo a crear una cuenta antes de la consulta.
        </p>

        <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
          <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
            <Compass className="h-4 w-4 text-am-doctor-500" strokeWidth={1.5} />
            UBICACIÓN EN LA INTERFAZ Y PASO A PASO
          </h5>
          <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-3 pl-1">
            <li>
              <span className="font-semibold text-am-surface-900">Menú lateral izquierdo:</span> Hacé clic en la opción <span className="font-semibold text-am-doctor-600">"Recetas"</span> (icono de Píldora) y presioná el botón <span className="font-semibold text-am-surface-900">"Nueva Receta"</span> ubicado en la esquina superior derecha.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Activación del formulario:</span> Dentro del buscador del modal que aparece, seleccioná la opción <span className="font-semibold text-am-doctor-600">"+ Atender Paciente Externo / Registrar Nuevo Paciente"</span>. Esto desplegará un formulario compacto.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Datos obligatorios para la receta:</span>
              <ul className="list-disc list-inside ml-5 mt-1.5 space-y-1.5 text-am-surface-500">
                <li><span className="font-medium text-am-surface-700">Nombre y Apellido completo:</span> Tal como figura en su credencial o documento.</li>
                <li><span className="font-medium text-am-surface-700">DNI o CUIL:</span> Ingresá el número de corrido, sin puntos ni espacios intermedios.</li>
                <li><span className="font-medium text-am-surface-700">Domicilio real completo:</span> Requisito legal obligatorio según la normativa de receta digital para que la farmacia apruebe su expendio.</li>
                <li><span className="font-medium text-am-surface-700">Contacto de envío:</span> Su celular (WhatsApp) o dirección de correo electrónico para notificarle la orden en el acto.</li>
              </ul>
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Emisión y despacho:</span> Completá el medicamento o la práctica requerida y presioná el botón inferior <span className="font-semibold text-am-doctor-600">"Firmar y Emitir"</span>.
            </li>
          </ol>
        </div>

        <div className="pt-2">
          <h6 className="text-[11px] font-bold uppercase tracking-widest text-am-surface-400 mb-3">Flujo del Paciente Externo</h6>
          <div className="flex flex-col sm:flex-row gap-3 items-center text-center">
            <div className="w-full sm:w-1/3 rounded-xl border border-am-surface-200 bg-white p-3 shadow-sm">
              <span className="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-am-surface-100 text-am-surface-600 text-xs font-bold mb-1">1</span>
              <p className="text-[11px] font-bold text-am-surface-800 uppercase">Carga de Datos</p>
              <p className="text-[10px] text-am-surface-500 mt-1">Completás DNI, domicilio y contacto</p>
            </div>
            <div className="hidden sm:block text-am-surface-300">
              <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="w-full sm:w-1/3 rounded-xl border border-am-surface-200 bg-white p-3 shadow-sm">
              <span className="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-am-surface-100 text-am-surface-600 text-xs font-bold mb-1">2</span>
              <p className="text-[11px] font-bold text-am-surface-800 uppercase">Firma Digital</p>
              <p className="text-[10px] text-am-surface-500 mt-1">El sistema estampa tu firma validada</p>
            </div>
            <div className="hidden sm:block text-am-surface-300">
              <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="w-full sm:w-1/3 rounded-xl border border-am-doctor-100 bg-am-doctor-50/30 p-3 shadow-sm">
              <span className="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-am-doctor-100 text-am-doctor-700 text-xs font-bold mb-1">3</span>
              <p className="text-[11px] font-bold text-am-doctor-700 uppercase">Envío Directo</p>
              <p className="text-[10px] text-am-doctor-600 mt-1">El paciente recibe la receta por WhatsApp/Email</p>
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
          <span className="font-semibold text-am-surface-900">No.</span> Los datos clínicos y de contacto de tus pacientes privados están completamente protegidos bajo secreto profesional y en conformidad con la Ley de Protección de Datos Personales N° 25.326.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 space-y-2">
            <span className="font-bold text-am-surface-800 text-xs flex items-center gap-1">
              <Lock className="h-4 w-4 text-am-surface-500" strokeWidth={1.5} /> SEGMENTACIÓN DEL CONSULTORIO:
            </span>
            <p className="text-xs text-am-surface-600 leading-relaxed">
              El paciente que cargues queda vinculado exclusivamente a tu perfil clínico profesional. Su ficha, historial de recetas y datos de contacto no aparecerán en búsquedas ni en listados de ningún otro médico de la plataforma.
            </p>
          </div>
          
          <div className="rounded-xl border border-am-doctor-100 bg-am-doctor-50/40 p-4 space-y-2">
            <span className="font-bold text-am-doctor-700 text-xs flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-am-doctor-600" strokeWidth={1.5} /> INDEPENDENCIA DE REGISTROS:
            </span>
            <p className="text-xs text-am-surface-600 leading-relaxed">
              Si tu paciente decide registrarse de forma autónoma en la plataforma para sacar turnos o ver recetas emitidas por otros profesionales, podrá hacerlo libremente. Sin embargo, <span className="font-bold text-am-surface-900">tus notas SOAP, evoluciones clínicas e historial de sesiones privadas contigo permanecen encriptados</span> y completamente inaccesibles para el resto de los médicos.
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
          <span className="font-semibold text-am-surface-900">Sí.</span> La legislación de salud digital y la Ley de Derechos del Paciente N° 26.529 garantizan la libre elección. El paciente es el único dueño de su salud y puede programar consultas con cualquier médico disponible en la cartilla general cuando lo decida.
        </p>
        <div className="rounded-xl bg-am-surface-50 border border-am-surface-200 p-4 flex gap-3 items-start">
          <Info className="h-5 w-5 text-am-surface-400 shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <h6 className="text-xs font-bold text-am-surface-800 uppercase">Confidencialidad de evoluciones</h6>
            <p className="text-xs text-am-surface-500 mt-1 leading-relaxed">
              Incluso si el paciente decide programar un turno con otro colega, tus diagnósticos, evoluciones y anotaciones privadas de consultorio no se comparten automáticamente ni son visibles para el nuevo profesional, resguardando tu práctica y criterio profesional.
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
          La emisión está homologada con la red nacional de validación farmacéutica **Farmalink (IMED)**. Al firmar el documento, la receta se registra en tiempo real en los sistemas nacionales para que el paciente pueda retirarla en cualquier farmacia física del país brindando únicamente su DNI o mostrando el código QR desde su celular.
        </p>

        <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
          <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
            <Compass className="h-4 w-4 text-am-doctor-500" strokeWidth={1.5} />
            DATOS REQUERIDOS Y UBICACIÓN EN LA INTERFAZ
          </h5>
          <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-3.5 pl-1">
            <li>
              <span className="font-semibold text-am-surface-900">Acceso al formulario:</span> En la barra lateral izquierda, hacé clic en la opción <span className="font-semibold text-am-doctor-600">"Recetas"</span> y presioná el botón <span className="font-semibold text-am-surface-900">"Nueva Receta"</span> (arriba a la derecha). *Nota: Si estás dentro de una consulta por videollamada, podés emitir la receta sin salir del video, usando la pestaña de recetas en el panel lateral derecho.*
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Buscador de vademécum:</span> En el campo **"Fármaco / Principio Activo"**, escribí el nombre del medicamento y seleccioná la opción correspondiente sugerida automáticamente por el listado oficial de Farmalink.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Campos obligatorios de dosificación:</span>
              <ul className="list-disc list-inside ml-5 mt-1 space-y-1 text-am-surface-500">
                <li><span className="font-medium text-am-surface-700">Dosis / Concentración:</span> ej. "500 mg".</li>
                <li><span className="font-medium text-am-surface-700">Frecuencia de toma:</span> ej. "cada 8 horas".</li>
                <li><span className="font-medium text-am-surface-700">Duración del tratamiento:</span> ej. "7 días".</li>
                <li><span className="font-medium text-am-surface-700">Cantidad de unidades/cajas:</span> ej. "1 caja".</li>
              </ul>
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Asociación diagnóstica (CIE-10):</span> Buscá y vinculá el diagnóstico o patología en el campo correspondiente. Es un requisito obligatorio para asegurar la aprobación de la cobertura médica del paciente.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Asistencia en la Redacción de Indicaciones (Opcional):</span> Completá las indicaciones de toma de forma manual, o hacé clic en **"Sugerir Pautas de Autocuidado"** para pre-llenar de forma inmediata indicaciones de alarma y consejos clínicos estandarizados basados en el diagnóstico.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Firma y Emisión:</span> Hacé clic en **"Firmar y Emitir"**. El sistema validará tu matrícula vigente en REFEPS/SISA, aplicará tu firma digital certificada y despachará la receta al instante.
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
          Un **borrador** es una indicación pre-cargada y guardada temporalmente en tu historial médico personal que **todavía no ha sido firmada digitalmente ni despachada al sistema de farmacias**.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
          <div className="p-4 bg-am-danger-light/60 border border-am-danger-light rounded-xl space-y-1.5 text-am-danger-dark">
            <span className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-am-danger-dark">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.5} /> ALCANCE Y LIMITACIONES:
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-am-surface-600 pl-1">
              <li>No le llega al paciente ni se registra en las farmacias.</li>
              <li>No tiene validez legal ni comercial en el mostrador.</li>
              <li>No consume tu cupo o firmas de recetas digitales.</li>
              <li>Permite edición total, cambio de fármaco o eliminación sin límites.</li>
            </ul>
          </div>
          
          <div className="p-4 bg-am-success-light/60 border border-am-success-light rounded-xl space-y-1.5 text-am-success-dark">
            <span className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-am-success-dark">
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} /> BENEFICIOS OPERATIVOS:
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-am-surface-600 pl-1">
              <li><span className="font-semibold text-am-surface-800">Carga anticipada:</span> Te permite pre-cargar las indicaciones y fármacos de tus turnos programados antes de iniciar el día.</li>
              <li><span className="font-semibold text-am-surface-800">Firma instantánea:</span> Durante la videoconsulta, tras evaluar la evolución del paciente en vivo, firmás y emitís la orden guardada con un solo toque.</li>
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
          Al presionar "Firmar y Emitir", AutaMedica genera automáticamente un documento PDF firmado digitalmente con su correspondiente código QR homologado. El envío al paciente está automatizado y se despacha sin costo a través de dos canales inmediatos:
        </p>

        <div className="space-y-3">
          <div className="flex items-start gap-4 rounded-xl border border-am-surface-200 p-4 bg-white shadow-sm hover:border-am-surface-300 transition-all">
            <div className="p-3 rounded-xl bg-am-success-light text-am-success-dark shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.742.002-2.602-1.01-5.05-2.85-6.89C16.643 2.133 14.191 1.12 11.59 1.12 6.155 1.12 1.73 5.49 1.727 10.862c-.001 1.724.46 3.41 1.332 4.888l-.991 3.62 3.731-.969c1.4.767 2.923 1.171 4.545 1.173H11.59z"/>
              </svg>
            </div>
            <div>
              <h5 className="text-xs font-bold text-am-surface-800 uppercase tracking-wide">WhatsApp Oficial de AutaMedica</h5>
              <p className="text-xs text-am-surface-500 leading-relaxed mt-1">
                El paciente recibe un mensaje de WhatsApp inmediato desde la línea oficial verificada. Contiene un enlace directo y protegido para que descargue el PDF clínico, presente el código QR directamente desde su celular en la farmacia y consulte la guía de indicaciones en formato de lectura ágil.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-xl border border-am-surface-200 p-4 bg-white shadow-sm hover:border-am-surface-300 transition-all">
            <div className="p-3 rounded-xl bg-am-info-light text-am-info-dark shrink-0">
              <FileText className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-am-surface-800 uppercase tracking-wide">Correo Electrónico</h5>
              <p className="text-xs text-am-surface-500 leading-relaxed mt-1">
                Si el paciente tiene un email registrado, se le envía un correo institucional desde `contacto@autamedica.com` con el PDF firmado digitalmente adjunto, listo para almacenar, imprimir o presentar ante las entidades médicas.
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
    question: "¿Cómo hago una llamada de videoconsulta? (Uso de la sala virtual y controles)",
    tags: ["llamada", "video", "sala", "entrar a consulta", "adhoc", "instantanea", "controles"],
    answer: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-am-surface-600">
          Podés iniciar videollamadas con tus pacientes por dos vías según la situación del turno:
        </p>

        <div className="space-y-3">
          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50">
            <h5 className="text-xs font-bold text-am-surface-800 uppercase flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-am-success-light text-am-success-dark font-bold text-xs">A</span>
              Para Turnos de tu Agenda (Programados):
            </h5>
            <p className="text-xs text-am-surface-600 leading-relaxed mt-1.5">
              <span className="font-semibold text-am-surface-900">Ubicación:</span> En tu pantalla de inicio (Dashboard), ubicá la sección **"Turnos de Hoy"**. Al llegar la hora del turno, se habilitará un botón verde que dice **"Entrar a Consulta"**. Al pulsarlo, ingresás a la sala virtual de atención y el sistema le envía automáticamente un mensaje de WhatsApp al paciente con el link de acceso para que se conecte.
            </p>
          </div>

          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50">
            <h5 className="text-xs font-bold text-am-surface-800 uppercase flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-am-surface-200 text-am-surface-700 font-bold text-xs">B</span>
              Videollamada Instantánea (Ad-Hoc - Sin Turno Previo):
            </h5>
            <p className="text-xs text-am-surface-600 leading-relaxed mt-1.5">
              <span className="font-semibold text-am-surface-900">Ubicación:</span> Arriba a la derecha en tu Dashboard, ubicá el panel **"Consulta Instantánea / Iniciar Videollamada Ad-Hoc"**. Seleccioná al paciente de tu listado y presioná el botón **"Iniciar videollamada"**. El sistema abrirá la sala y le enviará un WhatsApp inmediato al paciente con el enlace para conectarse al instante.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-3">
          <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-am-doctor-500" strokeWidth={1.5} />
            PANTALLA DE VIDEOLLAMADA Y CONTROLES CLÍNICOS
          </h5>
          <p className="text-xs text-am-surface-600 leading-relaxed">
            La sala de consulta virtual divide la pantalla para que atiendas al paciente sin perder contacto visual mientras completás los registros médicos:
          </p>
          <ul className="list-disc list-inside space-y-2 text-xs text-am-surface-500 pl-1">
            <li><span className="font-semibold text-am-surface-800">Lado Izquierdo (Pantalla de Video):</span> Imagen del paciente en tiempo real y barra flotante de controles para silenciar micrófono, apagar cámara, compartir tu pantalla o colgar llamada.</li>
            <li><span className="font-semibold text-am-surface-800">Lado Derecho (Ficha clínica integrada):</span> Panel con pestañas operativas para cargar datos clínicos sin cerrar el video:
              <ul className="list-disc list-inside ml-5 mt-1 space-y-1 text-am-surface-500">
                <li><span className="font-medium text-am-surface-700">SOAP:</span> Carga estructurada de la evolución clínica del paciente.</li>
                <li><span className="font-medium text-am-surface-700">Recetas:</span> Búsqueda en vademécum y emisión de recetas en el acto.</li>
                <li><span className="font-medium text-am-surface-700">Estudios:</span> Petición de laboratorios o exámenes diagnósticos.</li>
                <li><span className="font-medium text-am-surface-700">Historial:</span> Consulta rápida de antecedentes clínicos.</li>
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
          La cartilla de AutaMedica posiciona a los profesionales en base a la calidad y constancia de su servicio. El sistema evalúa y premia los siguientes procesos de tu consultorio de manera orgánica:
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-am-success shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <span className="font-bold text-am-surface-800">Matrícula validada y al día</span>
              <p className="text-am-surface-500 mt-1 leading-relaxed">Tener tu matrícula nacional o provincial aprobada y conectada a SISA/REFEPS. Es el requisito de ingreso indispensable para aparecer en el listado público.</p>
            </div>
          </div>
          
          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-am-doctor-600 shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <span className="font-bold text-am-surface-800">Asistencia a turnos</span>
              <p className="text-am-surface-500 mt-1 leading-relaxed">Cumplir con los turnos que aceptás. Reducir cancelaciones sobre la hora mantiene tu reputación en los niveles más altos.</p>
            </div>
          </div>
          
          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
            <Clock className="h-5 w-5 text-am-warning shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <span className="font-bold text-am-surface-800">Puntualidad en videollamadas</span>
              <p className="text-am-surface-500 mt-1 leading-relaxed">Estar a tiempo en la sala virtual. Iniciar la consulta en el horario acordado es clave para mantener tu perfil en los primeros puestos.</p>
            </div>
          </div>
          
          <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 flex items-start gap-3">
            <FileText className="h-5 w-5 text-am-doctor-600 shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <span className="font-bold text-am-surface-800">Evolución y pautas médicas</span>
              <p className="text-am-surface-500 mt-1 leading-relaxed">Completar la ficha SOAP al finalizar la consulta y guardar las indicaciones médicas del paciente con pautas de alarma suma puntos de posicionamiento.</p>
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
            <Compass className="h-4 w-4 text-am-doctor-500" strokeWidth={1.5} />
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
    question: "¿Qué debo escribir en el SOAP? ¿Cómo funciona la asistencia para la redacción de notas?",
    tags: ["soap", "reporte clinico", "evolucion clinica", "notas", "autocompletado", "formateo", "notas rapidas", "organizacion"],
    answer: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-am-surface-600">
          El registro de la evolución clínica en AutaMedica utiliza el formato estándar **SOAP** (Subjetivo, Objetivo, Análisis, Plan), que es el estándar internacional para documentar historias clínicas. El sistema te permite redactarlo de forma prolija sin perder contacto visual con el paciente:
        </p>

        <div className="rounded-xl border border-am-surface-200 bg-am-surface-50/50 p-4 space-y-3">
          <h6 className="text-xs font-bold text-am-surface-800 uppercase tracking-wide flex items-center gap-1.5">
            <Bookmark className="h-4 w-4 text-am-surface-500" strokeWidth={1.5} />
            Estructura simplificada del SOAP:
          </h6>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
              <span className="font-bold text-am-info uppercase text-[10px]">S - Subjetivo (Lo que refiere tu paciente)</span>
              <p className="text-am-surface-50 mt-1 leading-relaxed">Su motivo de consulta, síntomas expresados, antecedentes y malestares referidos.</p>
            </div>
            <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
              <span className="font-bold text-am-success uppercase text-[10px]">O - Objetivo (Lo que observás)</span>
              <p className="text-am-surface-50 mt-1 leading-relaxed">Tus observaciones visuales clínicas, signos vitales informados o estudios previos.</p>
            </div>
            <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
              <span className="font-bold text-am-doctor-500 uppercase text-[10px]">A - Análisis (Tu diagnóstico)</span>
              <p className="text-am-surface-50 mt-1 leading-relaxed">Tu criterio profesional y la asociación diagnóstica oficial (CIE-10).</p>
            </div>
            <div className="p-3 bg-white border border-am-surface-200 rounded-xl">
              <span className="font-bold text-am-warning uppercase text-[10px]">P - Plan Clínico (El tratamiento)</span>
              <p className="text-am-surface-50 mt-1 leading-relaxed">La indicación médica: medicamentos, dosis, estudios solicitados y pautas de alarma.</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
          <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
            <Brain className="h-4 w-4 text-am-doctor-500" strokeWidth={1.5} />
            HERRAMIENTAS DE FORMATEO Y REDACCIÓN RÁPIDA
          </h5>
          <p className="text-xs text-am-surface-600 leading-relaxed">
            El sistema incluye una función de autocompletado y estructuración que te permite ordenar tus anotaciones crudas en formato clínico formal en pocos segundos:
          </p>
          <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-2.5 pl-1">
            <li>
              <span className="font-semibold text-am-surface-900">Anotaciones rápidas:</span> Durante la videollamada, podés usar el bloque **"Notas rápidas del doctor"** en el panel derecho para anotar palabras sueltas, abreviaciones o datos crudos (ej: *"pcte 40a, cefalea, TA 140/90, indico reposo"*).
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Estructuración con un clic:</span> Al finalizar la videoconsulta, presioná el botón **"Estructurar Notas SOAP"** ubicado justo debajo del cuadro de notas.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Pre-llenado de campos:</span> El sistema analiza tus palabras clave y las organiza de forma prolija en los 4 campos de la historia clínica (S, O, A, P) con la terminología médica formal correspondiente.
            </li>
            <li>
              <span className="font-semibold text-am-surface-900">Edición y guardado:</span> Podés corregir o complementar el texto pre-llenado de cada área de forma manual antes de presionar **"Guardar Historia Clínica"**.
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
          **Sí, la sincronización es inmediata.** Tu tiempo y tu agenda son fundamentales: si bloqueás un horario en tu calendario, ese espacio desaparece automáticamente de tu disponibilidad pública para que ningún paciente reserve por error.
        </p>
        
        <div className="rounded-xl border border-am-surface-200 p-4 bg-am-surface-50 space-y-3">
          <h5 className="text-xs font-bold text-am-surface-800 uppercase flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-am-doctor-600" strokeWidth={1.5} />
            ¿Qué es un bloqueo de horario (Evento)?
          </h5>
          <p className="text-xs text-am-surface-600 leading-relaxed">
            Un **evento** es un bloqueo de tiempo personal o profesional externo a AutaMedica que registrás en tu calendario (ej. *"Guardia hospitalaria"*, *"Congreso"*, *"Descanso"* o *"Trámite personal"*). Al guardarlo, prevenís reservas en horarios comprometidos.
          </p>
          
          <span className="font-bold text-am-surface-800 text-xs block uppercase tracking-wider">Cómo se crea en tu agenda:</span>
          <ol className="list-decimal list-inside text-xs text-am-surface-600 space-y-2 pl-1">
            <li>Dirigite a la sección <span className="font-semibold text-am-surface-900">"Citas"</span> (calendario) en la barra lateral izquierda.</li>
            <li>Hacé clic y arrastrá el cursor sobre el bloque de horas que querés bloquear en la grilla horaria.</li>
            <li>En la ventana emergente que aparece, elegí la opción <span className="font-semibold text-am-surface-900">"Crear Evento / Bloquear Horario"</span>.</li>
            <li>Escribí una referencia descriptiva rápida y presioná <span className="font-semibold text-am-surface-900">"Guardar"</span>.</li>
          </ol>
          
          <p className="text-xs text-am-warning-dark bg-am-warning-light p-3 rounded-xl border border-am-warning-light leading-relaxed font-semibold">
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
          Los honorarios de tus videoconsultas particulares se acreditan directamente en tu cuenta de MercadoPago. Para habilitar los cobros:
        </p>

        <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-5 space-y-4">
          <h5 className="text-xs font-bold uppercase tracking-wider text-am-doctor-600 flex items-center gap-1.5">
            <Compass className="h-4 w-4 text-am-doctor-500" strokeWidth={1.5} />
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
              <span className="font-semibold text-am-surface-900">Autorización:</span> El sistema te redirigirá automáticamente al portal seguro de MercadoPago para ingresar tus credenciales y autorizar la sincronización en un solo clic.
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
          <span className="font-semibold text-am-surface-900">Sí.</span> Para sostener la infraestructura de videollamadas, la red de recetas firmadas y el soporte del sistema, <span className="font-semibold text-am-surface-900">AutaMedica retiene una comisión del 15% por cada videoconsulta realizada</span> en la cartilla pública.
        </p>
        <div className="rounded-xl bg-am-surface-50 border border-am-surface-200 p-4 flex gap-3 items-start mt-2">
          <Info className="h-5 w-5 text-am-surface-400 shrink-0 mt-0.5" strokeWidth={1.5} />
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
    tags: ["suscripción", "planes", "pago", "debito", "pro", "premium", "badges"],
    answer: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-am-surface-600">
          El uso básico de AutaMedica para atender a tus pacientes privados de siempre y emitir recetas digitales es **100% gratuito**. Sin embargo, si querés incorporar funciones operativas avanzadas, podés suscribirte a nuestros planes mensuales adicionales:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-am-surface-200 bg-white p-4 shadow-sm space-y-2">
            <span className="h-2 w-12 rounded-full bg-am-doctor-500 block" />
            <h5 className="font-bold text-am-surface-800 text-xs uppercase tracking-wide">Herramientas Avanzadas (Planes Pro / Premium)</h5>
            <p className="text-xs text-am-surface-500 leading-relaxed">
              Habilitan el uso ilimitado de la función de autocompletado y estructuración de notas SOAP, el pre-llenado de pautas de autocuidado para pacientes, destacan tu perfil con distintivos de verificación en la cartilla pública y priorizan tu visibilidad en las búsquedas del marketplace.
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
];
