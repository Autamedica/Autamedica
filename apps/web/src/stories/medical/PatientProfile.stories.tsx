import type { Meta, StoryObj } from '@storybook/react';
import { Badge, Button, Card } from '@autamedica/ui';
import {
  Calendar,
  Phone,
  Mail,
  AlertTriangle,
  Droplets,
  Heart,
} from 'lucide-react';

interface PatientData {
  name: string;
  initials: string;
  age: number;
  dni: string;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  lastVisit: string;
  phone: string;
  email: string;
  totalConsultas: number;
  totalRecetas: number;
  alertas: number;
}

const DEFAULT_PATIENT: PatientData = {
  name: 'Maria Garcia Lopez',
  initials: 'MG',
  age: 34,
  dni: '32.456.789',
  bloodType: 'A+',
  allergies: ['Penicilina', 'Sulfonamidas'],
  conditions: ['Diabetes Tipo 2', 'Hipertension'],
  lastVisit: '28 de marzo, 2026',
  phone: '+54 11 4567-8901',
  email: 'maria.garcia@email.com',
  totalConsultas: 12,
  totalRecetas: 5,
  alertas: 2,
};

function PatientProfileMockup({ patient = DEFAULT_PATIENT }: { patient?: PatientData }) {
  return (
    <div style={{ width: '400px' }}>
      <Card variant="elevated" padding="lg">
        {/* Avatar + nombre */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-xl font-bold text-sky-700">
            {patient.initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{patient.name}</h2>
            <p className="text-sm text-gray-500">{patient.age} anos -- DNI {patient.dni}</p>
          </div>
        </div>

        {/* Info rapida */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{patient.totalConsultas}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Consultas</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{patient.totalRecetas}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Recetas</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{patient.alertas}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Alertas</p>
          </div>
        </div>

        {/* Grupo sanguineo + alergias */}
        <div className="space-y-3 mb-5">
          <div className="flex items-center gap-3">
            <Droplets className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-sm text-gray-600">Grupo sanguineo:</span>
            <Badge variant="danger">{patient.bloodType}</Badge>
          </div>

          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-gray-600">Alergias:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {patient.allergies.map((a) => (
                  <Badge key={a} variant="warning" size="xs">{a}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Heart className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-gray-600">Condiciones:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {patient.conditions.map((c) => (
                  <Badge key={c} variant="primary" size="xs">{c}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="border-t border-gray-100 pt-4 mb-5 space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5" />
            {patient.phone}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Mail className="h-3.5 w-3.5" />
            {patient.email}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            Ultima visita: {patient.lastVisit}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <Button variant="primary" size="sm" fullWidth>
            Agendar turno
          </Button>
          <Button variant="doctor" size="sm" fullWidth>
            Videoconsulta
          </Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="secondary" size="sm" fullWidth>
            Ver historial
          </Button>
          <Button variant="ghost" size="sm" fullWidth>
            Editar
          </Button>
        </div>
      </Card>
    </div>
  );
}

const meta: Meta<typeof PatientProfileMockup> = {
  title: 'Medical/Patient Profile',
  component: PatientProfileMockup,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof PatientProfileMockup>;

export const Default: Story = {};

export const PacienteJoven: Story = {
  args: {
    patient: {
      name: 'Lucia Fernandez',
      initials: 'LF',
      age: 22,
      dni: '42.123.456',
      bloodType: 'O-',
      allergies: ['Latex'],
      conditions: ['Asma'],
      lastVisit: '15 de marzo, 2026',
      phone: '+54 11 2345-6789',
      email: 'lucia.f@email.com',
      totalConsultas: 3,
      totalRecetas: 1,
      alertas: 0,
    },
  },
};

export const PacienteCronico: Story = {
  args: {
    patient: {
      name: 'Jorge Alberto Ramirez',
      initials: 'JR',
      age: 67,
      dni: '14.789.012',
      bloodType: 'B+',
      allergies: ['Penicilina', 'AINEs', 'Contraste yodado'],
      conditions: ['EPOC', 'Insuficiencia cardiaca', 'Fibrilacion auricular', 'Diabetes Tipo 2'],
      lastVisit: '30 de marzo, 2026',
      phone: '+54 11 9876-5432',
      email: 'jorge.ramirez@email.com',
      totalConsultas: 47,
      totalRecetas: 18,
      alertas: 5,
    },
  },
};

export const SinAlergias: Story = {
  args: {
    patient: {
      ...DEFAULT_PATIENT,
      name: 'Carlos Eduardo Sosa',
      initials: 'CS',
      age: 28,
      allergies: [],
      conditions: [],
      alertas: 0,
    },
  },
};
