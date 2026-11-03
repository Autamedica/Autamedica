export type FarmalinkSex = 'M' | 'F' | 'X';
export type FarmalinkDocumentType = 'DN' | 'LC' | 'LE' | 'CI' | 'PA';
export type FarmalinkBooleanFlag = 'S' | 'N';
export type FarmalinkTreatmentType = 'N' | 'P';

export interface FarmalinkInfoCabeceraRq {
  idOrganizacion: string;
  tipoOrganizacion: string;
  ipOrigen?: string;
  infoBrowser?: string;
}

export interface FarmalinkCredentialRq {
  codEntidad: number;
  pan: string;
  plan: string;
}

export interface FarmalinkPersonDocument {
  tipoDocumento: FarmalinkDocumentType;
  numeroDocumento?: number;
  numeroPasaporte?: string;
}

export interface FarmalinkAfiliadoRq extends FarmalinkPersonDocument {
  nombre: string;
  apellido: string;
  sexo: FarmalinkSex;
  fechaNacimiento: string;
  cuil?: number;
  mail?: string;
  datosOfuscado: FarmalinkBooleanFlag;
  credencial: FarmalinkCredentialRq;
}

export interface FarmalinkMatriculaRq {
  tipo: string;
  provincia: string;
  numero: string | number;
  especialidad?: string | {
    clasificador?: number;
    codigo?: string;
    textoLibre?: string;
  };
}

export interface FarmalinkMedicoRq extends FarmalinkPersonDocument {
  nombre: string;
  apellido: string;
  sexo: FarmalinkSex;
  fechaNacimiento: string;
  cuil?: number;
  mail?: string;
  domicilioAtencion: string;
  codigoReFeps?: number;
  matricula: FarmalinkMatriculaRq;
}

export interface FarmalinkDiagnosticoRq {
  clasificador?: number;
  codigo?: string;
  textoLibre?: string;
}

export interface FarmalinkItemRq {
  cantidad: number;
  codProducto: string;
  codDroga: string;
  textoGenerico: string;
  generico?: FarmalinkBooleanFlag;
  recomendacionMedica?: FarmalinkBooleanFlag;
  diagnostico?: FarmalinkDiagnosticoRq;
}

export interface FarmalinkAltaRecetaRequest {
  altaRecetaElectRq: {
    infoCabeceraRq: Required<Pick<FarmalinkInfoCabeceraRq, 'idOrganizacion' | 'tipoOrganizacion' | 'ipOrigen'>>
      & Pick<FarmalinkInfoCabeceraRq, 'infoBrowser'>;
    recElectronica: {
      tipoReceta?: string;
      fechaVigenciaDesde: string;
      fechaVigenciaHasta: string;
      tipoTratamiento: FarmalinkTreatmentType;
      diagnostico?: FarmalinkDiagnosticoRq;
      afiliado: FarmalinkAfiliadoRq;
      medico: FarmalinkMedicoRq;
      detalleRecElectronica: {
        item: FarmalinkItemRq[];
      };
    };
  };
}

export interface FarmalinkRecetaReferenceRequest {
  infoCabeceraRq: Pick<FarmalinkInfoCabeceraRq, 'idOrganizacion' | 'tipoOrganizacion'>;
  recElectronica: {
    afiliado: {
      codEntidad: number;
      pan: string;
    };
    receta: {
      nroRecElectronica: string;
    };
  };
}

export interface FarmalinkConsultaRecetaRequest {
  consultaRecetaElectRq: FarmalinkRecetaReferenceRequest;
}

export interface FarmalinkBajaRecetaRequest {
  bajaRecetaElectRq: FarmalinkRecetaReferenceRequest;
}

export interface FarmalinkRespuesta {
  codigo?: string;
  descripcion?: string;
  datosAdicionales?: string;
  referencia?: string;
}

export interface FarmalinkAltaRecetaResponse {
  altaRecetaElectRs?: {
    respuesta?: FarmalinkRespuesta;
    recElectronica?: {
      nroRecElectronica?: string;
      cuir?: string;
    };
  };
}

export interface FarmalinkTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id?: string;
}

export interface FarmalinkClientConfig {
  baseUrl: string;
  tokenPath: string;
  recetaBasePath: string;
  oauthUsername: string;
  oauthPassword: string;
  basicUser: string;
  basicPassword: string;
  scope: string;
  grantType?: string;
  fetch?: typeof fetch;
}

export interface FarmalinkResolvedConfig extends Partial<FarmalinkClientConfig> {
  enabled: boolean;
  missing: string[];
}

export interface FarmalinkAltaResult {
  approved: boolean;
  responseCode?: string;
  responseDescription?: string;
  reference?: string;
  nroRecElectronica?: string;
  raw: FarmalinkAltaRecetaResponse;
}

export interface FarmalinkPrescriptionMapInput {
  organization: {
    id: string;
    type: string;
    ipOrigin: string;
    browserInfo?: string;
    /** @deprecated Ignored. Farmalink explicitly instructed AutaMedica to omit puntoEmisor. */
    issuerPointId?: number;
  };
  validity: {
    from: string;
    to: string;
  };
  treatmentType?: FarmalinkTreatmentType;
  prescriptionType?: string;
  diagnosisText?: string;
  affiliate: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    sex?: string;
    birthDate: string;
    cuil?: string;
    email?: string;
    documentType?: FarmalinkDocumentType;
    documentNumber?: string;
    passportNumber?: string;
    dataObfuscated?: boolean;
    credential: FarmalinkCredentialRq;
  };
  prescriber: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    sex?: string;
    birthDate: string;
    cuil?: string;
    email?: string;
    documentType?: FarmalinkDocumentType;
    documentNumber: string;
    address: string;
    refeps?: string;
    license: FarmalinkMatriculaRq;
  };
  items: Array<{
    quantity: number;
    productCode: string;
    drugCode: string;
    genericText: string;
    generic?: boolean;
    brandRecommended?: boolean;
    diagnosisText?: string;
  }>;
}
