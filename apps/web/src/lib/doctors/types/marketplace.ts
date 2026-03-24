export interface Coordinates {
  lat: number
  lng: number
}

export interface Location {
  city: string
  province: string
  country: string
  coordinates: Coordinates
}

export const ARGENTINE_PROVINCES = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán'
] as const

export const ARGENTINE_CITIES = {
  'Ciudad Autónoma de Buenos Aires': { lat: -34.6037, lng: -58.3816 },
  'La Plata': { lat: -34.9215, lng: -57.9545 },
  'Mar del Plata': { lat: -38.0055, lng: -57.5426 },
  'Córdoba': { lat: -31.4135, lng: -64.1811 },
  'Rosario': { lat: -32.9442, lng: -60.6505 },
  'Mendoza': { lat: -32.8908, lng: -68.8272 },
  'San Miguel de Tucumán': { lat: -26.8083, lng: -65.2176 },
  'Salta': { lat: -24.7859, lng: -65.4117 },
  'Santa Fe': { lat: -31.6333, lng: -60.7 },
  'San Juan': { lat: -31.5375, lng: -68.5364 },
  'Resistencia': { lat: -27.4611, lng: -58.9844 },
  'Neuquén': { lat: -38.9516, lng: -68.0591 },
  'Posadas': { lat: -27.3621, lng: -55.8981 },
  'Bariloche': { lat: -41.1335, lng: -71.3103 },
  'Comodoro Rivadavia': { lat: -45.8667, lng: -67.5 }
} as const
