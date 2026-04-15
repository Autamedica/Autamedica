/**
 * Maps raw API call error codes to user-friendly Spanish messages.
 * Provides contextual information about why the call can't be made.
 */
import {
  getAppointmentWindowStartMs,
  getAppointmentWindowEndMs,
  EARLY_JOIN_WINDOW_MS,
  LATE_JOIN_GRACE_MS,
} from './telemedicine-window'

export interface CallErrorContext {
  appointmentStartTime?: string | null
  appointmentEndTime?: string | null
  durationMinutes?: number | null
}

export interface CallErrorMessage {
  title: string
  description: string
  /** Optional: when the user CAN try again */
  retryHint?: string
}

function formatTimeAR(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Buenos_Aires',
  }).format(date)
}

function translateOutsideWindow(context?: CallErrorContext): CallErrorMessage {
  if (!context?.appointmentStartTime) {
    return {
      title: 'Fuera de la ventana de acceso',
      description:
        'La videollamada solo está disponible desde 45 minutos antes del turno hasta 24 horas después.',
    }
  }

  const startMs = Date.parse(context.appointmentStartTime)
  if (Number.isNaN(startMs)) {
    return {
      title: 'Fuera de la ventana de acceso',
      description:
        'La videollamada solo está disponible desde 45 minutos antes del turno hasta 24 horas después.',
    }
  }

  const now = Date.now()
  const windowOpensAt = startMs - EARLY_JOIN_WINDOW_MS
  const formattedStart = formatTimeAR(context.appointmentStartTime)

  if (now < windowOpensAt) {
    return {
      title: 'Tu turno aún no comenzó',
      description: `Podés ingresar a partir de las ${formatTimeAR(new Date(windowOpensAt).toISOString())} (45 min antes del turno).`,
      retryHint: `El turno es a las ${formattedStart}`,
    }
  }

  // Past window
  return {
    title: 'La ventana de acceso expiró',
    description: `El turno fue a las ${formattedStart} y la ventana cerró 24 horas después.`,
  }
}

const STATIC_ERRORS: Record<string, CallErrorMessage> = {
  appointment_not_found: {
    title: 'Turno no encontrado',
    description: 'El turno fue cancelado o no existe.',
  },
  call_already_ended: {
    title: 'La llamada ya terminó',
    description: 'Esta videollamada ya fue finalizada.',
  },
  appointment_not_telemedicine: {
    title: 'Este turno no es de telemedicina',
    description: 'Solo los turnos de telemedicina permiten videollamada.',
  },
  unauthorized: {
    title: 'No tenés acceso a esta llamada',
    description: 'Verificá que hayas iniciado sesión con la cuenta correcta.',
  },
  forbidden: {
    title: 'No tenés acceso a esta llamada',
    description: 'No tenés permisos para acceder a esta videollamada.',
  },
}

export function translateCallError(
  errorCode: string,
  context?: CallErrorContext,
): CallErrorMessage {
  if (errorCode === 'appointment_outside_call_window') {
    return translateOutsideWindow(context)
  }

  const staticMatch = STATIC_ERRORS[errorCode]
  if (staticMatch) return staticMatch

  return {
    title: errorCode === 'appointment_not_callable' ? 'El horario de atención venció' : 'No pudimos iniciar la videollamada',
    description: errorCode === 'appointment_not_callable' ? 'Este turno ya no se puede iniciar porque expiró el tiempo de espera. Por favor, creá un nuevo turno si necesitás atender al paciente.' : errorCode,
  }
}

// ---------------------------------------------------------------------------
// Call window status helper
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable description of the call window status for an appointment.
 * Used to show WHY a call button is disabled and WHEN it will be available.
 */
export function getCallWindowStatus(appointment: {
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
}): {
  isOpen: boolean
  message: string
  /** If window is not open yet, when it opens (ms from now). null if already past. */
  opensInMs: number | null
} {
  const startMs = getAppointmentWindowStartMs(appointment)

  if (startMs === null) {
    return { isOpen: false, message: 'Sin horario programado', opensInMs: null }
  }

  const endMs = getAppointmentWindowEndMs(appointment)
  const now = Date.now()
  const windowOpensAt = startMs - EARLY_JOIN_WINDOW_MS
  const windowClosesAt = (endMs ?? startMs) + LATE_JOIN_GRACE_MS

  if (now < windowOpensAt) {
    const opensTime = formatTimeAR(new Date(windowOpensAt).toISOString())
    return {
      isOpen: false,
      message: `Disponible a las ${opensTime}`,
      opensInMs: windowOpensAt - now,
    }
  }

  if (now <= windowClosesAt) {
    return { isOpen: true, message: 'Videollamada disponible', opensInMs: null }
  }

  const formattedStart = formatTimeAR(new Date(startMs).toISOString())
  return {
    isOpen: false,
    message: `Ventana cerrada (turno fue a las ${formattedStart})`,
    opensInMs: null,
  }
}
