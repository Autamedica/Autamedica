'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import { OrderCard } from './OrderCard';
import { ValidationPanel } from './ValidationPanel';
import { DispensePanel } from './DispensePanel';

interface DispensationOrder {
  id: string;
  prescription_id: string;
  patient_id: string;
  doctor_id: string;
  pharmacy_id: string;
  medication: string | null;
  formulation: string | null;
  dose_mg_per_day: number | null;
  quantity_units: number | null;
  duration_days: number | null;
  prescription_type: string;
  status: string;
  clinical_semaphore: string | null;
  semaphore_reasons: string[] | null;
  extraordinary_dose_flag: boolean;
  requires_clarification: boolean;
  dispense_window_start: string | null;
  dispense_window_end: string | null;
  created_at: string;
  updated_at: string;
}

type View = 'list' | 'validate' | 'dispense';

const STATUS_TABS = [
  { key: 'active', label: 'Activas', statuses: 'pending,assigned,under_review,clarification_requested,clarification_provided' },
  { key: 'ready', label: 'Listas para dispensar', statuses: 'approved_for_dispensation' },
  { key: 'dispensed', label: 'Dispensadas', statuses: 'dispensed,partially_dispensed' },
  { key: 'blocked', label: 'Bloqueadas', statuses: 'blocked' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  clarification_requested: 'bg-orange-100 text-orange-700',
  clarification_provided: 'bg-cyan-100 text-cyan-700',
  approved_for_dispensation: 'bg-green-100 text-green-700',
  dispensed: 'bg-emerald-100 text-emerald-700',
  partially_dispensed: 'bg-lime-100 text-lime-700',
  blocked: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500',
  expired: 'bg-gray-200 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  under_review: 'En revisión',
  clarification_requested: 'Aclaración solicitada',
  clarification_provided: 'Aclaración recibida',
  approved_for_dispensation: 'Aprobada',
  dispensed: 'Dispensada',
  partially_dispensed: 'Parcialmente dispensada',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

export function PharmacyDashboard() {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <DashboardContent />
    </AuthProvider>
  );
}

function DashboardContent() {
  const { loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<DispensationOrder[]>([]);
  const [pharmacistId, setPharmacistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('active');
  const [view, setView] = useState<View>('list');
  const [selectedOrder, setSelectedOrder] = useState<DispensationOrder | null>(null);

  const fetchOrders = useCallback(async (statuses: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<{ orders: DispensationOrder[]; pharmacistId: string | null }>(
        `/api/pharmacy/orders?status=${statuses}`
      );
      setOrders(data.orders);
      setPharmacistId(data.pharmacistId);
    } catch (err) {
      logger.error('[PharmacyDashboard] Fetch error', err);
      setError('Error al cargar órdenes. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  const currentTab = STATUS_TABS.find(t => t.key === activeTab) ?? STATUS_TABS[0];

  useEffect(() => {
    if (!authLoading) {
      fetchOrders(currentTab.statuses);
    }
  }, [authLoading, activeTab, currentTab.statuses]); // fetchOrders is stable (empty deps)

  const handleSelectOrder = (order: DispensationOrder) => {
    setSelectedOrder(order);
    if (order.status === 'approved_for_dispensation' || order.status === 'partially_dispensed') {
      setView('dispense');
    } else if (['pending', 'assigned', 'under_review', 'clarification_provided'].includes(order.status)) {
      setView('validate');
    }
  };

  const handleBack = () => {
    setView('list');
    setSelectedOrder(null);
    fetchOrders(currentTab.statuses);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-am-surface-50 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-am-surface-300 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!pharmacistId && !loading) {
    return (
      <div className="min-h-screen bg-am-surface-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-am-md p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-am-surface-900 mb-2">Sin farmacia asociada</h2>
          <p className="text-sm text-am-surface-500">
            Tu cuenta no está vinculada a ninguna farmacia. Contactá al administrador para configurar tu acceso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-am-surface-50">
      {/* Header */}
      <header className="border-b border-am-surface-200 bg-white shadow-am-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {view !== 'list' && (
              <button onClick={handleBack} aria-label="Volver al listado" className="p-1.5 rounded-lg hover:bg-am-surface-100 transition">
                <svg className="w-5 h-5 text-am-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h1 className="text-lg font-semibold text-am-surface-900">
                {view === 'list' ? 'Portal Farmacia' : view === 'validate' ? 'Validar Orden' : 'Dispensar Medicamento'}
              </h1>
              {selectedOrder && view !== 'list' && (
                <p className="text-xs text-am-surface-400">{selectedOrder.medication} — Orden #{selectedOrder.id.slice(0, 8)}</p>
              )}
            </div>
          </div>
          {view === 'list' && (
            <button
              onClick={() => fetchOrders(currentTab.statuses)}
              className="text-sm text-am-surface-500 hover:text-am-surface-700 transition flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {view === 'list' && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por estado">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    activeTab === tab.key
                      ? 'bg-emerald-600 text-white shadow-am-sm'
                      : 'bg-white text-am-surface-600 border border-am-surface-200 hover:bg-am-surface-50'
                  }`}
                >
                  {tab.label}
                  {!loading && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                      activeTab === tab.key ? 'bg-white/20' : 'bg-am-surface-100'
                    }`}>
                      {orders.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-4 flex items-center justify-between" role="alert">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  onClick={() => fetchOrders(currentTab.statuses)}
                  className="text-sm font-medium text-red-700 hover:text-red-900 underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Orders list */}
            {loading ? (
              <div className="space-y-3" aria-busy="true" aria-label="Cargando órdenes">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-xl shadow-am-sm border border-am-surface-200 p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-48 bg-am-surface-200 rounded" />
                        <div className="h-3 w-32 bg-am-surface-100 rounded" />
                        <div className="flex gap-2">
                          <div className="h-5 w-20 bg-am-surface-100 rounded-full" />
                          <div className="h-5 w-16 bg-am-surface-100 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-am-sm border border-am-surface-200 p-12 text-center">
                <p className="text-sm text-am-surface-500">No hay órdenes en esta categoría</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    statusColors={STATUS_COLORS}
                    statusLabels={STATUS_LABELS}
                    onSelect={() => handleSelectOrder(order)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {view === 'validate' && selectedOrder && (
          <ValidationPanel
            order={selectedOrder}
            onComplete={handleBack}
            statusLabels={STATUS_LABELS}
          />
        )}

        {view === 'dispense' && selectedOrder && (
          <DispensePanel
            order={selectedOrder}
            onComplete={handleBack}
          />
        )}
      </main>
    </div>
  );
}
