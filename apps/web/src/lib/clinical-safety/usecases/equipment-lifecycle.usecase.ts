import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  MedicalEquipment,
  EquipmentIncident,
  EquipmentEvent,
  IEquipmentSafetyRepository,
} from '@autamedica/types';
import { logger } from '@autamedica/shared';

type Db = SupabaseClient<Database>;
type UpdateEquipmentStatusWithCalibration = (
  id: string,
  status: MedicalEquipment['current_status'],
  calibration?: {
    lastCalibratedAt: string;
    nextCalibrationDue: string;
  }
) => Promise<MedicalEquipment>;

export interface EquipmentLifecycleDeps {
  supabase: Db;
  equipmentSafetyRepo: IEquipmentSafetyRepository;
}

export interface UpdateStatusRequest {
  equipmentId: string;
  targetStatus: MedicalEquipment['current_status'];
  actorId: string;
  notes: string;
  calibrationCertificateUrl?: string; // Mandatorio para pasar de validation_pending a active
}

export interface UpdateStatusResponse {
  success: boolean;
  equipment: MedicalEquipment;
  event: EquipmentEvent;
}

export interface CheckAvailabilityRequest {
  equipmentId: string;
}

export interface CheckAvailabilityResponse {
  isAvailable: boolean;
  status: MedicalEquipment['current_status'];
  reason?: string;
  backupDeviceSuggested: boolean;
}

export interface TecnovigilanciaReportRequest {
  incidentId: string;
}

export interface TecnovigilanciaReportResponse {
  success: boolean;
  reportXml: string;
  reportJson: any;
}

const CALIBRATION_VALIDITY_DAYS = 180;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function actionTypeForStatus(status: MedicalEquipment['current_status']): EquipmentEvent['action_type'] {
  if (status === 'active') return 'verify';
  if (status === 'validation_pending') return 'calibrate';
  if (status === 'review_required') return 'diagnose';
  if (status === 'decommissioned') return 'close';
  return 'repair';
}

async function ensureIncidentForEquipmentEvent(
  repo: IEquipmentSafetyRepository,
  input: {
    equipmentId: string;
    actorId: string;
    targetStatus: MedicalEquipment['current_status'];
    notes: string;
    calibrationCertificateUrl?: string;
  }
): Promise<EquipmentIncident> {
  const activeIncident = await repo.getOpenIncidentForEquipment(input.equipmentId);
  if (activeIncident) return activeIncident;

  return repo.createEquipmentIncident({
    equipment_id: input.equipmentId,
    reporter_id: input.actorId,
    assigned_technician_id: null,
    severity: input.targetStatus === 'active' ? 'low' : 'medium',
    status: 'open',
    resolved_at: null,
    next_verification_due: null,
    technical_summary: `Evento de ciclo de vida CEEDS sin ticket previo: ${input.targetStatus}. Notas: ${input.notes}`,
    calibration_certificate_url: input.calibrationCertificateUrl ?? null,
    closed_at: null,
  });
}

/**
 * 1. FSM State Transition Usecase
 * Governs transitions between: active, review_required, under_maintenance, validation_pending, decommissioned.
 */
export async function updateEquipmentStatusUseCase(
  deps: EquipmentLifecycleDeps,
  input: UpdateStatusRequest
): Promise<UpdateStatusResponse> {
  const { equipmentSafetyRepo } = deps;
  const { equipmentId, targetStatus, actorId, notes, calibrationCertificateUrl } = input;

  // 1. Fetch current equipment state
  const device = await equipmentSafetyRepo.getEquipmentById(equipmentId);
  if (!device) {
    throw new Error(`Medical equipment not found: ${equipmentId}`);
  }

  const currentStatus = device.current_status;
  let incidentForEvent = await equipmentSafetyRepo.getOpenIncidentForEquipment(equipmentId);
  let calibration:
    | {
        lastCalibratedAt: string;
        nextCalibrationDue: string;
      }
    | undefined;

  // 2. Validate ANMAT strict transition rule: validation_pending -> active
  if (targetStatus === 'active' && currentStatus === 'validation_pending') {
    // Check if certificate URL was provided in parameters or exists in active ticket
    const certUrl = calibrationCertificateUrl || incidentForEvent?.calibration_certificate_url;
    if (!certUrl || certUrl.trim() === '') {
      throw new Error(
        'REGLA ANMAT EXIGIDA: No se puede habilitar un equipo desde Validación Pendiente sin adjuntar un certificado de calibración metrológica firmado.'
      );
    }

    const now = new Date();
    calibration = {
      lastCalibratedAt: now.toISOString(),
      nextCalibrationDue: addDays(now, CALIBRATION_VALIDITY_DAYS).toISOString(),
    };
  }

  // 3. Ensure every immutable equipment event has a real incident FK.
  if (!incidentForEvent) {
    incidentForEvent = await ensureIncidentForEquipmentEvent(equipmentSafetyRepo, {
      equipmentId,
      actorId,
      targetStatus,
      notes,
      calibrationCertificateUrl,
    });
  }

  // 4. Update device status FSM
  const updatedDevice = await (equipmentSafetyRepo.updateEquipmentStatus as UpdateEquipmentStatusWithCalibration)(
    equipmentId,
    targetStatus,
    calibration
  );

  // 5. Log immutable Equipment Event
  const loggedEvent = await equipmentSafetyRepo.logEquipmentEvent({
    incident_id: incidentForEvent.id,
    actor_id: actorId,
    action_type: actionTypeForStatus(targetStatus),
    is_resolved: targetStatus === 'active',
    notes: `Transición de estado: ${currentStatus} -> ${targetStatus}. Notas: ${notes}`,
  });

  // 6. Resolve ticket only after the immutable event exists.
  if (targetStatus === 'active') {
    await equipmentSafetyRepo.resolveIncident(incidentForEvent.id, {
      status: 'resolved',
      calibration_certificate_url: calibrationCertificateUrl || incidentForEvent.calibration_certificate_url,
      technical_summary: `Equipo habilitado. Notas: ${notes}`,
    });
  }

  return {
    success: true,
    equipment: updatedDevice,
    event: loggedEvent,
  };
}

/**
 * 2. Equipment Availability and Calibration Lockout Usecase
 * Blocks scheduling if next_calibration_due has expired or status is not active.
 */
export async function checkDeviceAvailabilityUseCase(
  deps: EquipmentLifecycleDeps,
  input: CheckAvailabilityRequest
): Promise<CheckAvailabilityResponse> {
  const { equipmentSafetyRepo } = deps;
  const { equipmentId } = input;

  const device = await equipmentSafetyRepo.getEquipmentById(equipmentId);
  if (!device) {
    return {
      isAvailable: false,
      status: 'decommissioned',
      reason: 'El dispositivo no está registrado.',
      backupDeviceSuggested: false,
    };
  }

  // A. Check calibration countdown breach (lockout)
  const isCalibrationExpired = new Date(device.next_calibration_due).getTime() <= Date.now();
  if (isCalibrationExpired) {
    logger.warn('[checkDeviceAvailability] Calibration expired. Device lockout triggered.', {
      equipmentId,
      nextCalibrationDue: device.next_calibration_due,
    });
    return {
      isAvailable: false,
      status: device.current_status,
      reason: `BLOQUEO DE SEGURIDAD: La fecha límite de calibración venció el ${new Date(device.next_calibration_due).toLocaleDateString()}. Requiere re-calibración metrológica.`,
      backupDeviceSuggested: true,
    };
  }

  // B. Verify FSM status
  if (device.current_status !== 'active') {
    return {
      isAvailable: false,
      status: device.current_status,
      reason: `El equipamiento no está operativo (Estado actual: ${device.current_status}).`,
      backupDeviceSuggested: true,
    };
  }

  return {
    isAvailable: true,
    status: 'active',
    backupDeviceSuggested: false,
  };
}

/**
 * 3. ANMAT Tecnovigilancia Report Compiler Usecase
 * Generates XML and JSON standardized adverse event reports for ANMAT tecnovigilancia notification queues.
 */
export async function generateTecnovigilanciaReportUseCase(
  deps: EquipmentLifecycleDeps,
  input: TecnovigilanciaReportRequest
): Promise<TecnovigilanciaReportResponse> {
  const { supabase } = deps;
  const { incidentId } = input;

  // 1. Fetch incident detail
  const { data: incident, error: incidentErr } = await supabase
    .from('equipment_incidents')
    .select('*, medical_equipment(*)')
    .eq('id', incidentId)
    .maybeSingle();

  if (incidentErr || !incident) {
    throw new Error(`Incident not found for tecnovigilancia: ${incidentId}`);
  }

  const device = incident.medical_equipment as unknown as MedicalEquipment;

  // 2. Build JSON report
  const reportJson = {
    report_metadata: {
      framework: 'ANMAT_TECNOVIGILANCIA_AR',
      version: '1.0',
      timestamp: new Date().toISOString(),
      security_hash: `TEC-${device.serial_number}-${Date.now().toString(16).toUpperCase()}`,
    },
    device_identity: {
      serial_number: device.serial_number,
      brand: device.brand,
      model: device.model_name,
      device_type: device.device_type,
      snomed_device_code: device.snomed_device_code || '450637000',
    },
    adverse_event_context: {
      incident_id: incident.id,
      severity: incident.severity,
      reported_at: incident.reported_at,
      technical_summary: incident.technical_summary || 'Falla técnica crítica sin resumen estructurado aún.',
      operating_hours: device.operating_hours,
      last_calibrated_at: device.last_calibrated_at,
    },
  };

  // 3. Compile XML report conforming to ANMAT surveillance schemas
  const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<TecnovigilanciaReport xmlns="http://www.anmat.gov.ar/tecnovigilancia">
  <Header>
    <Framework>ANMAT_TECNOVIGILANCIA_AR</Framework>
    <ReportVersion>1.0</ReportVersion>
    <Timestamp>${reportJson.report_metadata.timestamp}</Timestamp>
    <SecurityHash>${reportJson.report_metadata.security_hash}</SecurityHash>
  </Header>
  <Device>
    <SerialNumber>${device.serial_number}</SerialNumber>
    <Brand>${device.brand}</Brand>
    <Model>${device.model_name}</Model>
    <DeviceType>${device.device_type}</DeviceType>
    <SnomedCode>${reportJson.device_identity.snomed_device_code}</SnomedCode>
  </Device>
  <EventContext>
    <IncidentId>${incident.id}</IncidentId>
    <Severity>${incident.severity}</Severity>
    <ReportedAt>${incident.reported_at}</ReportedAt>
    <Summary>${reportJson.adverse_event_context.technical_summary}</Summary>
    <OperatingHours>${device.operating_hours}</OperatingHours>
    <LastCalibration>${device.last_calibrated_at}</LastCalibration>
  </EventContext>
</TecnovigilanciaReport>`;

  return {
    success: true,
    reportXml,
    reportJson,
  };
}
