'use client';

export function CreateAppointmentModal({ onClose, onSaved }: { onClose: () => void, onSaved: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-sm p-4">
        <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold mb-4">Programar Cita</h2>
            <p className="text-sm text-stone-600 mb-6">Estamos configurando el formulario de creación de citas para doctores.</p>
            <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 border border-stone-200 py-2 rounded-xl text-sm font-bold">Cancelar</button>
                <button onClick={onSaved} className="flex-1 bg-am-primary-600 text-white py-2 rounded-xl text-sm font-bold">Guardar</button>
            </div>
        </div>
    </div>
  )
}
