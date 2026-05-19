import type {
  FarmalinkAltaRecetaRequest,
  FarmalinkBajaRecetaRequest,
  FarmalinkBooleanFlag,
  FarmalinkConsultaRecetaRequest,
  FarmalinkDiagnosticoRq,
  FarmalinkDocumentType,
  FarmalinkPrescriptionMapInput,
  FarmalinkRecetaReferenceRequest,
  FarmalinkSex,
} from './farmalink.types';

export class FarmalinkMappingError extends Error {
  constructor(
    public readonly field: string,
    message = `Missing or invalid Farmalink field: ${field}`,
  ) {
    super(message);
    this.name = 'FarmalinkMappingError';
  }
}

function assertText(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new FarmalinkMappingError(field);
  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function digitsOnly(value: string | number | undefined): string | undefined {
  if (typeof value === 'number') return String(value);
  const digits = value?.replace(/\D/g, '');
  return digits || undefined;
}

function numberFromDigits(value: string | number | undefined, field: string): number {
  const digits = digitsOnly(value);
  if (!digits) throw new FarmalinkMappingError(field);
  return Number(digits);
}

function optionalNumberFromDigits(value: string | number | undefined): number | undefined {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : undefined;
}

function positiveNumber(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new FarmalinkMappingError(field);
  }
  return value;
}

function dateOnly(value: string, field: string): string {
  const normalized = assertText(value, field);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new FarmalinkMappingError(field, `${field} must use YYYY-MM-DD`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function boolFlag(value: boolean | undefined, defaultValue: FarmalinkBooleanFlag): FarmalinkBooleanFlag {
  if (value === undefined) return defaultValue;
  return value ? 'S' : 'N';
}

export function normalizeFarmalinkSex(value: string | undefined): FarmalinkSex {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'X';
  if (['m', 'male', 'masculino', 'hombre'].includes(normalized)) return 'M';
  if (['f', 'female', 'femenino', 'mujer'].includes(normalized)) return 'F';
  return 'X';
}

function resolveName(
  input: { firstName?: string; lastName?: string; fullName?: string },
  fieldPrefix: string,
): { firstName: string; lastName: string } {
  const explicitFirstName = optionalText(input.firstName);
  const explicitLastName = optionalText(input.lastName);

  if (explicitFirstName && explicitLastName) {
    return { firstName: explicitFirstName, lastName: explicitLastName };
  }

  const fullName = assertText(input.fullName, `${fieldPrefix}.fullName`);
  const parts = fullName.replace(/^Dr\.?\s+/i, '').trim().split(/\s+/);
  if (parts.length < 2) {
    throw new FarmalinkMappingError(`${fieldPrefix}.lastName`);
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.at(-1) ?? '',
  };
}

function documentFields(
  documentType: FarmalinkDocumentType | undefined,
  documentNumber: string | undefined,
  passportNumber: string | undefined,
  fieldPrefix: string,
): { tipoDocumento: FarmalinkDocumentType; numeroDocumento?: number; numeroPasaporte?: string } {
  const tipoDocumento = documentType ?? 'DN';
  if (tipoDocumento === 'PA') {
    return {
      tipoDocumento,
      numeroPasaporte: assertText(passportNumber, `${fieldPrefix}.passportNumber`),
    };
  }

  return {
    tipoDocumento,
    numeroDocumento: numberFromDigits(documentNumber, `${fieldPrefix}.documentNumber`),
  };
}

function diagnostic(text: string | undefined): FarmalinkDiagnosticoRq | undefined {
  const normalized = optionalText(text);
  return normalized ? { textoLibre: normalized.slice(0, 250) } : undefined;
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefined(entry)]),
    ) as T;
  }

  return value;
}

export function buildFarmalinkAltaRecetaRequest(
  input: FarmalinkPrescriptionMapInput,
): FarmalinkAltaRecetaRequest {
  const affiliateName = resolveName(input.affiliate, 'affiliate');
  const prescriberName = resolveName(input.prescriber, 'prescriber');
  const items = input.items.map((item, index) => {
    const itemDiagnosis = input.diagnosisText ? undefined : diagnostic(item.diagnosisText);

    return withoutUndefined({
      cantidad: item.quantity,
      codProducto: assertText(digitsOnly(item.productCode), `items.${index}.productCode`).padStart(5, '0'),
      codDroga: assertText(digitsOnly(item.drugCode), `items.${index}.drugCode`).padStart(5, '0'),
      textoGenerico: assertText(item.genericText, `items.${index}.genericText`),
      generico: boolFlag(item.generic, 'S'),
      recomendacionMedica: boolFlag(item.brandRecommended, 'N'),
      diagnostico: itemDiagnosis,
    });
  });

  if (items.length === 0) throw new FarmalinkMappingError('items');

  const request: FarmalinkAltaRecetaRequest = {
    altaRecetaElectRq: {
      infoCabeceraRq: {
        idOrganizacion: assertText(input.organization.id, 'organization.id'),
        tipoOrganizacion: assertText(input.organization.type, 'organization.type'),
        ipOrigen: assertText(input.organization.ipOrigin, 'organization.ipOrigin'),
        infoBrowser: optionalText(input.organization.browserInfo) ?? '',
      },
      puntoEmisor: input.organization.issuerPointId ? { id: input.organization.issuerPointId } : undefined,
      recElectronica: {
        tipoReceta: optionalText(input.prescriptionType),
        fechaVigenciaDesde: dateOnly(input.validity.from, 'validity.from'),
        fechaVigenciaHasta: dateOnly(input.validity.to, 'validity.to'),
        tipoTratamiento: input.treatmentType ?? 'N',
        diagnostico: diagnostic(input.diagnosisText),
        afiliado: {
          nombre: affiliateName.firstName,
          apellido: affiliateName.lastName,
          sexo: normalizeFarmalinkSex(input.affiliate.sex),
          fechaNacimiento: dateOnly(input.affiliate.birthDate, 'affiliate.birthDate'),
          cuil: optionalNumberFromDigits(input.affiliate.cuil),
          mail: optionalText(input.affiliate.email),
          datosOfuscado: boolFlag(input.affiliate.dataObfuscated, 'N'),
          credencial: {
            codEntidad: positiveNumber(input.affiliate.credential.codEntidad, 'affiliate.credential.codEntidad'),
            pan: assertText(digitsOnly(input.affiliate.credential.pan), 'affiliate.credential.pan'),
            plan: assertText(input.affiliate.credential.plan, 'affiliate.credential.plan'),
          },
          ...documentFields(
            input.affiliate.documentType,
            input.affiliate.documentNumber,
            input.affiliate.passportNumber,
            'affiliate',
          ),
        },
        medico: {
          nombre: prescriberName.firstName,
          apellido: prescriberName.lastName,
          sexo: normalizeFarmalinkSex(input.prescriber.sex),
          fechaNacimiento: dateOnly(input.prescriber.birthDate, 'prescriber.birthDate'),
          cuil: optionalNumberFromDigits(input.prescriber.cuil),
          mail: optionalText(input.prescriber.email),
          domicilioAtencion: assertText(input.prescriber.address, 'prescriber.address'),
          codigoReFeps: optionalNumberFromDigits(input.prescriber.refeps),
          matricula: {
            tipo: assertText(input.prescriber.license.tipo, 'prescriber.license.tipo'),
            provincia: assertText(input.prescriber.license.provincia, 'prescriber.license.provincia'),
            numero: assertText(input.prescriber.license.numero, 'prescriber.license.numero'),
            especialidad: optionalText(input.prescriber.license.especialidad),
          },
          ...documentFields(
            input.prescriber.documentType,
            input.prescriber.documentNumber,
            undefined,
            'prescriber',
          ),
        },
        detalleRecElectronica: {
          item: items,
        },
      },
    },
  };

  return withoutUndefined(request);
}

function recetaReferenceRequest(input: {
  idOrganizacion: string;
  tipoOrganizacion: string;
  codEntidad: number;
  pan: string;
  nroRecElectronica: string;
}): FarmalinkRecetaReferenceRequest {
  return {
    infoCabeceraRq: {
      idOrganizacion: assertText(input.idOrganizacion, 'idOrganizacion'),
      tipoOrganizacion: assertText(input.tipoOrganizacion, 'tipoOrganizacion'),
    },
    recElectronica: {
      afiliado: {
        codEntidad: input.codEntidad,
        pan: assertText(digitsOnly(input.pan), 'pan'),
      },
      receta: {
        nroRecElectronica: assertText(input.nroRecElectronica, 'nroRecElectronica'),
      },
    },
  };
}

export function buildFarmalinkConsultaRecetaRequest(
  input: Parameters<typeof recetaReferenceRequest>[0],
): FarmalinkConsultaRecetaRequest {
  return { consultaRecetaElectRq: recetaReferenceRequest(input) };
}

export function buildFarmalinkBajaRecetaRequest(
  input: Parameters<typeof recetaReferenceRequest>[0],
): FarmalinkBajaRecetaRequest {
  return { bajaRecetaElectRq: recetaReferenceRequest(input) };
}
