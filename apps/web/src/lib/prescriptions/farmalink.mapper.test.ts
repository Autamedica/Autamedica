import { describe, expect, it } from 'vitest';
import {
  FarmalinkMappingError,
  buildFarmalinkAltaRecetaRequest,
  buildFarmalinkBajaRecetaRequest,
  buildFarmalinkConsultaRecetaRequest,
  normalizeFarmalinkSex,
} from './farmalink.mapper';

const baseInput = {
  organization: {
    id: '182',
    type: 'NMD',
    ipOrigin: '8.8.8.8',
    browserInfo: 'AutaMedica Homologacion',
    issuerPointId: 10000, // Legacy input must never be serialized to Farmalink.
  },
  validity: {
    from: '2026-05-18T12:00:00.000Z',
    to: '2026-06-17',
  },
  prescriptionType: '01',
  diagnosisText: 'Cefalea',
  affiliate: {
    fullName: 'Maria Gonzalez',
    sex: 'female',
    birthDate: '1990-06-14',
    cuil: '27-30123456-8',
    documentNumber: '30.123.456',
    credential: {
      codEntidad: 7110,
      pan: '20123456786',
      plan: 'NO POSEE',
    },
  },
  prescriber: {
    fullName: 'Dr. Eduardo Marques',
    sex: 'male',
    birthDate: '1980-01-01',
    documentNumber: '22333444',
    address: 'Av. Santa Fe 1500, CABA',
    refeps: '54122333444',
    license: {
      tipo: 'MN',
      provincia: 'C',
      numero: '123456',
      especialidad: 'Clinica Medica',
    },
  },
  items: [
    {
      quantity: 1,
      productCode: '123',
      drugCode: '1',
      genericText: 'AMOXICILINA 500 MG COMPRIMIDOS',
      generic: true,
      brandRecommended: false,
    },
  ],
};

describe('Farmalink mapper', () => {
  it('normalizes AutaMedica prescription data into AltaRecetaElectRq', () => {
    const request = buildFarmalinkAltaRecetaRequest(baseInput);
    expect(Object.prototype.hasOwnProperty.call(request.altaRecetaElectRq, 'puntoEmisor')).toBe(false);

    expect(request).toEqual({
      altaRecetaElectRq: {
        infoCabeceraRq: {
          idOrganizacion: '182',
          tipoOrganizacion: 'NMD',
          ipOrigen: '8.8.8.8',
          infoBrowser: 'AutaMedica Homologacion',
        },
        recElectronica: {
          tipoReceta: '01',
          fechaVigenciaDesde: '2026-05-18',
          fechaVigenciaHasta: '2026-06-17',
          tipoTratamiento: 'N',
          diagnostico: { textoLibre: 'Cefalea' },
          afiliado: {
            nombre: 'Maria',
            apellido: 'Gonzalez',
            sexo: 'F',
            fechaNacimiento: '1990-06-14',
            cuil: 27301234568,
            tipoDocumento: 'DN',
            numeroDocumento: 30123456,
            datosOfuscado: 'N',
            credencial: {
              codEntidad: 7110,
              pan: '20123456786',
              plan: 'NO POSEE',
            },
          },
          medico: {
            nombre: 'Eduardo',
            apellido: 'Marques',
            sexo: 'M',
            fechaNacimiento: '1980-01-01',
            tipoDocumento: 'DN',
            numeroDocumento: 22333444,
            domicilioAtencion: 'Av. Santa Fe 1500, CABA',
            codigoReFeps: 54122333444,
            matricula: {
              tipo: 'MN',
              provincia: 'C',
              numero: 123456,
              especialidad: {
                textoLibre: 'Clinica Medica',
              },
            },
          },
          detalleRecElectronica: {
            item: [
              {
                cantidad: 1,
                codProducto: '00123',
                codDroga: '00001',
                textoGenerico: 'AMOXICILINA 500 MG COMPRIMIDOS',
                generico: 'S',
                recomendacionMedica: 'N',
              },
            ],
          },
        },
      },
    });
  });

  it('rejects the obsolete organization 100 before sending a request', () => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,
      organization: { ...baseInput.organization, id: '100' },
    })).toThrow(FarmalinkMappingError);
  });

  it('maps the two required generic S and brand N scenarios without a point emitter', () => {
    const generic = buildFarmalinkAltaRecetaRequest(baseInput).altaRecetaElectRq;
    const brand = buildFarmalinkAltaRecetaRequest({
      ...baseInput,
      items: [{ ...baseInput.items[0], generic: false, brandRecommended: true }],
    }).altaRecetaElectRq;
    expect(generic.recElectronica.detalleRecElectronica.item[0]).toMatchObject({
      generico: 'S', recomendacionMedica: 'N',
    });
    expect(brand.recElectronica.detalleRecElectronica.item[0]).toMatchObject({
      generico: 'N', recomendacionMedica: 'S',
    });
    expect(Object.prototype.hasOwnProperty.call(generic, 'puntoEmisor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(brand, 'puntoEmisor')).toBe(false);
  });

  it('builds consulta and baja requests with the same Farmalink recipe reference shape', () => {
    const reference = {
      idOrganizacion: '182',
      tipoOrganizacion: 'NMD',
      codEntidad: 7110,
      pan: '20123456786',
      nroRecElectronica: '9600000002762',
    };

    expect(buildFarmalinkConsultaRecetaRequest(reference)).toEqual({
      consultaRecetaElectRq: {
        infoCabeceraRq: {
          idOrganizacion: '182',
          tipoOrganizacion: 'NMD',
        },
        recElectronica: {
          afiliado: {
            codEntidad: 7110,
            pan: '20123456786',
          },
          receta: {
            nroRecElectronica: '9600000002762',
          },
        },
      },
    });
    expect(buildFarmalinkBajaRecetaRequest(reference).bajaRecetaElectRq)
      .toEqual(buildFarmalinkConsultaRecetaRequest(reference).consultaRecetaElectRq);
  });

  it('normalizes sex values to Farmalink codes', () => {
    expect(normalizeFarmalinkSex('Masculino')).toBe('M');
    expect(normalizeFarmalinkSex('mujer')).toBe('F');
    expect(normalizeFarmalinkSex('prefer_not_to_say')).toBe('X');
  });

  it('throws a field-scoped error when a required value is missing', () => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,
      prescriber: {
        ...baseInput.prescriber,
        address: '',
      },
    })).toThrow(FarmalinkMappingError);
  });

  it('throws when the Farmalink entity code is missing', () => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,
      affiliate: {
        ...baseInput.affiliate,
        credential: {
          ...baseInput.affiliate.credential,
          codEntidad: Number.NaN,
        },
      },
    })).toThrow(FarmalinkMappingError);
  });
  it('rejects a missing prescriber specialty before contacting Farmalink', () => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,
      prescriber: {
        ...baseInput.prescriber,
        license: {
          tipo: 'MN',
          provincia: 'C',
          numero: '123456',
        },
      },
    })).toThrow(FarmalinkMappingError);
  });

  it('rejects an empty prescriber specialty before contacting Farmalink', () => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,
      prescriber: {
        ...baseInput.prescriber,
        license: {
          ...baseInput.prescriber.license,
          especialidad: '   ',
        },
      },
    })).toThrow(FarmalinkMappingError);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid quantity %s', (quantity) => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput, items:[{...baseInput.items[0],quantity}],
    })).toThrow(FarmalinkMappingError);
  });

  it.each(['2026-02-30','2026-13-01'])('rejects impossible date %s', (from) => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,validity:{...baseInput.validity,from},
    })).toThrow(FarmalinkMappingError);
  });

  it('rejects expiration before the issue date', () => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,validity:{from:'2026-06-17',to:'2026-05-18'},
    })).toThrow(FarmalinkMappingError);
  });

  it.each(['ABC123','9007199254740993','0','-123'])('rejects an invalid patient identifier %s', (documentNumber) => {
    expect(() => buildFarmalinkAltaRecetaRequest({
      ...baseInput,affiliate:{...baseInput.affiliate,documentNumber},
    })).toThrow(FarmalinkMappingError);
  });

});

