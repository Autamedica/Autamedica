import { Briefcase } from 'lucide-react';

const MarketplaceDashboard: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-gray-600 bg-gray-800/50 py-20 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-700 border border-gray-600">
        <Briefcase className="h-7 w-7 text-gray-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Marketplace en desarrollo
        </h2>
        <p className="max-w-md text-sm text-gray-400">
          El marketplace medico corporativo esta en desarrollo.
          Proximamente podras publicar ofertas laborales,
          gestionar aplicaciones y contratar profesionales medicos.
        </p>
      </div>
    </div>
  );
};

export default MarketplaceDashboard;
