'use client';

import { useState } from 'react';
import { Bell, CheckCircle, Loader2 } from 'lucide-react';

interface WaitlistButtonProps {
  doctorId: string;
  doctorName?: string;
}

export function WaitlistButton({ doctorId, doctorName }: WaitlistButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoinWaitlist = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctorId,
          appointment_type: 'consultation',
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al anotarse');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al anotarse en lista de espera');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span>
          Te anotamos en la lista de espera
          {doctorName ? ` del Dr. ${doctorName}` : ''}.
          Te avisaremos cuando haya un turno disponible.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <button
        onClick={handleJoinWaitlist}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 bg-stone-100 border border-stone-200 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
        {loading ? 'Anotando...' : 'Avisarme cuando haya turno'}
      </button>
    </div>
  );
}
