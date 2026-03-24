'use client';

import { useAppointments } from '@/lib/doctors/features/appointments/useAppointments';
import { StartCallButton } from '@/components/doctors/calls/StartCallButton';

interface AppointmentsViewProps {
  doctorId?: string
}

export default function AppointmentsView({ doctorId }: AppointmentsViewProps) {
  const { status, error, rows, refresh } = useAppointments();

  if (status === 'loading') return <p>Cargando...</p>;
  if (status === 'error')   return <p>Error: {error}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Citas</h1>
        <button onClick={() => refresh()} className="rounded px-3 py-1 border">
          Refrescar
        </button>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2 text-left">Paciente</th>
            <th className="border p-2 text-left">Fecha</th>
            <th className="border p-2 text-left">Duración</th>
            <th className="border p-2 text-left">Tipo</th>
            <th className="border p-2 text-left">Estado</th>
            <th className="border p-2 text-left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const canStartCall = r.type === 'telemedicine'
              && (r.status === 'scheduled' || r.status === 'confirmed')
              && doctorId;

            return (
              <tr key={r.id}>
                <td className="border p-2">{r.patientId}</td>
                <td className="border p-2">{new Date(r.startTime).toLocaleString()}</td>
                <td className="border p-2">{r.durationMinutes} min</td>
                <td className="border p-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    r.type === 'telemedicine' ? 'bg-purple-100 text-purple-800' :
                    'bg-am-surface-100 text-am-surface-800'
                  }`}>
                    {r.type}
                  </span>
                </td>
                <td className="border p-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    r.status === 'scheduled' ? 'bg-am-doctor-100 text-am-doctor-800' :
                    r.status === 'confirmed' ? 'bg-am-doctor-100 text-am-doctor-800' :
                    r.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                    r.status === 'completed' ? 'bg-green-100 text-green-800' :
                    r.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-am-surface-100 text-am-surface-800'
                  }`}>
                    {r.status}
                  </span>
                </td>
                <td className="border p-2">
                  {canStartCall && (
                    <StartCallButton
                      doctorId={doctorId}
                      patientId={r.patientId}
                      appointmentId={r.id}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm"
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && status === 'success' && (
        <p className="text-am-surface-500 text-center py-4">No hay citas programadas</p>
      )}
    </div>
  );
}
