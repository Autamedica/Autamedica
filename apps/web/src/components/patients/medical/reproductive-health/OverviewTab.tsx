'use client';

import { CheckCircle, Shield, Clock, Heart, BookOpen } from 'lucide-react';

const bgMap: Record<string, string> = {
  green: 'bg-emerald-50 border-emerald-200',
  blue: 'bg-am-primary-50 border-am-primary-200',
  yellow: 'bg-amber-50 border-amber-200',
  rose: 'bg-rose-50 border-rose-200',
};

interface InfoCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

function InfoCard({ icon, title, description, color }: InfoCardProps) {
  const colorClasses = bgMap[color] ?? 'bg-[var(--au-surface)] border-[var(--au-border)]';

  return (
    <div className={`${colorClasses} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h3 className="font-semibold text-[var(--au-text-primary)] mb-1">{title}</h3>
          <p className="text-[var(--au-text-secondary)] text-sm">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function OverviewTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-md">
        <div className="flex items-start gap-3 mb-4">
          <BookOpen className="h-6 w-6 text-[var(--au-text-secondary)]" />
          <div>
            <h2 className="heading-2 mb-2">Que es la IVE/ILE?</h2>
            <p className="text-body leading-relaxed">
              La <strong className="text-[var(--au-text-primary)]">Interrupcion Voluntaria del Embarazo (IVE)</strong> es
              un derecho garantizado por la Ley 27.610 hasta la semana 14 de gestacion.
            </p>
            <p className="text-body leading-relaxed mt-2">
              La <strong className="text-[var(--au-text-primary)]">Interrupcion Legal del Embarazo (ILE)</strong> es
              el derecho a interrumpir el embarazo en cualquier momento si fue producto de una violacion
              o si esta en riesgo la vida o salud de la persona gestante.
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <InfoCard
          icon={<CheckCircle className="h-5 w-5 text-green-400" />}
          title="Es legal y gratuito"
          description="En todos los hospitales publicos y obras sociales de Argentina"
          color="green"
        />
        <InfoCard
          icon={<Shield className="h-5 w-5 text-blue-400" />}
          title="Es confidencial"
          description="Tu privacidad esta protegida por ley. No se requiere autorizacion de terceros"
          color="blue"
        />
        <InfoCard
          icon={<Clock className="h-5 w-5 text-yellow-400" />}
          title="Atencion inmediata"
          description="El sistema de salud debe darte una respuesta en maximo 10 dias corridos"
          color="yellow"
        />
        <InfoCard
          icon={<Heart className="h-5 w-5 text-rose-600" />}
          title="Acompanamiento integral"
          description="Tienes derecho a consejeria pre y post intervencion"
          color="rose"
        />
      </div>
    </div>
  );
}
