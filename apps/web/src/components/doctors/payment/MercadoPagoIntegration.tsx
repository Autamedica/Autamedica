'use client'

import { logger } from '@autamedica/shared'
import { AlertCircle, CheckCircle, CreditCard, Loader, Lock, Shield } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface PaymentMethod {
  id: string
  type: 'credit_card' | 'debit_card'
  last_four_digits: string
  payment_method_id: string
  issuer: {
    id: string
    name: string
  }
  security_code?: {
    length: number
    card_location: string
  }
}

interface PaymentData {
  id: string
  status: 'approved' | 'pending' | 'rejected'
  status_detail: string
  operation_type: string
  date_approved: string
  transaction_amount: number
  currency_id: string
  description: string
  payment_method_id: string
  payer: {
    id: string
    email: string
  }
}

interface MercadoPagoCheckoutProps {
  planId: string
  amount: number
  currency: string
  description: string
  onSuccess: (paymentData: PaymentData) => void
  onError: (error: unknown) => void
  onPending?: (paymentData: PaymentData) => void
}

interface MercadoPagoSubscriptionManagerProps {
  currentPlanId: string
  onPlanChange: (newPlanId: string) => void
}

export function MercadoPagoCheckout({
  planId: _planId,
  amount,
  currency: _currency,
  description,
  onSuccess: _onSuccess,
  onError,
  onPending: _onPending
}: MercadoPagoCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const [cardData, setCardData] = useState({
    cardNumber: '',
    expirationDate: '',
    securityCode: '',
    cardholderName: '',
    identificationType: 'DNI',
    identificationNumber: ''
  })

  const initializeMercadoPago = useCallback(async () => {
    try {
      // En producción, esto se cargaría desde las variables de entorno
      // SDK de MercadoPago pendiente de integración
      // En implementación real:
      // const publicKey = import.meta.env.PUBLIC_MERCADOPAGO_KEY || ''
      // await window.MercadoPago.initialize({ locale: 'es-AR', environment: 'sandbox' })
      // await window.MercadoPago.setPublishableKey(publicKey)
    } catch (error) {
      logger.error('Error inicializando MercadoPago:', error)
      onError(error)
    }
  }, [onError])

  const loadSavedPaymentMethods = useCallback(async () => {
    try {
      setPaymentMethods([])
    } catch (error) {
      logger.error('Error cargando métodos de pago:', error)
    }
  }, [])

  useEffect(() => {
    initializeMercadoPago()
    loadSavedPaymentMethods()
  }, [initializeMercadoPago, loadSavedPaymentMethods])

  const processPayment = async () => {
    if (!selectedPaymentMethod && !cardData.cardNumber) {
      onError({ message: 'Debe seleccionar o agregar un método de pago' })
      return
    }

    setIsLoading(true)

    try {
      onError({ message: 'Integración de pagos pendiente de configuración. Contacte soporte.' })
    } catch (error) {
      onError(error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = matches?.[0] || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    if (parts.length) {
      return parts.join(' ')
    } else {
      return v
    }
  }

  return (
    <div className="space-y-6">
      {/* Métodos de pago guardados */}
      {paymentMethods.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Métodos de pago guardados</h3>
          <div className="space-y-2">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                onClick={() => setSelectedPaymentMethod(method.id)}
                className={`p-4 border rounded-xl shadow-sm cursor-pointer transition-colors ${
                  selectedPaymentMethod === method.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-gray-900 font-medium">
                        {method.issuer.name} •••• {method.last_four_digits}
                      </p>
                      <p className="text-gray-500 text-sm">
                        {method.type === 'credit_card' ? 'Tarjeta de crédito' : 'Tarjeta de débito'}
                      </p>
                    </div>
                  </div>
                  {selectedPaymentMethod === method.id && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agregar nueva tarjeta */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3">
          {paymentMethods.length > 0 ? 'Agregar nueva tarjeta' : 'Información de la tarjeta'}
        </h3>

        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Numero de tarjeta
            </label>
            <input
              type="text"
              value={cardData.cardNumber}
              onChange={(e) => setCardData(prev => ({
                ...prev,
                cardNumber: formatCardNumber(e.target.value)
              }))}
              placeholder="1234 5678 9012 3456"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={19}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de vencimiento
              </label>
              <input
                type="text"
                value={cardData.expirationDate}
                onChange={(e) => {
                  let value = e.target.value.replace(/\D/g, '')
                  if (value.length >= 2) {
                    value = value.substring(0, 2) + '/' + value.substring(2, 4)
                  }
                  setCardData(prev => ({ ...prev, expirationDate: value }))
                }}
                placeholder="MM/AA"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={5}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Codigo de seguridad
              </label>
              <input
                type="text"
                value={cardData.securityCode}
                onChange={(e) => setCardData(prev => ({
                  ...prev,
                  securityCode: e.target.value.replace(/\D/g, '')
                }))}
                placeholder="123"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del titular
            </label>
            <input
              type="text"
              value={cardData.cardholderName}
              onChange={(e) => setCardData(prev => ({
                ...prev,
                cardholderName: e.target.value.toUpperCase()
              }))}
              placeholder="JUAN PEREZ"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de documento
              </label>
              <select
                value={cardData.identificationType}
                onChange={(e) => setCardData(prev => ({ ...prev, identificationType: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DNI">DNI</option>
                <option value="CUIL">CUIL</option>
                <option value="CUIT">CUIT</option>
                <option value="LC">Libreta Cívica</option>
                <option value="LE">Libreta de Enrolamiento</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Numero de documento
              </label>
              <input
                type="text"
                value={cardData.identificationNumber}
                onChange={(e) => setCardData(prev => ({
                  ...prev,
                  identificationNumber: e.target.value.replace(/\D/g, '')
                }))}
                placeholder="12345678"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resumen del pago */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-4">
        <h4 className="text-md font-medium text-gray-900 mb-3">Resumen del pago</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Plan:</span>
            <span className="text-gray-900">{description}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal:</span>
            <span className="text-gray-900">${amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">IVA (21%):</span>
            <span className="text-gray-900">${(amount * 0.21).toLocaleString()}</span>
          </div>
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between font-medium">
              <span className="text-gray-900">Total:</span>
              <span className="text-gray-900">${(amount * 1.21).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Seguridad */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Lock className="w-4 h-4" />
        <Shield className="w-4 h-4" />
        <span>Transacción segura encriptada por MercadoPago</span>
      </div>

      {/* Botón de pago */}
      <button
        onClick={processPayment}
        disabled={isLoading || (!selectedPaymentMethod && !cardData.cardNumber)}
        className="w-full flex items-center justify-center gap-2 bg-[#009ee3] hover:bg-[#007eb5] disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-colors"
      >
        {isLoading ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Procesando pago...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Pagar ${(amount * 1.21).toLocaleString()}
          </>
        )}
      </button>
    </div>
  )
}

export function MercadoPagoSubscriptionManager({
  currentPlanId: _currentPlanId,
  onPlanChange
}: MercadoPagoSubscriptionManagerProps) {
  const [subscriptionStatus, _setSubscriptionStatus] = useState<'active' | 'cancelled' | 'past_due' | null>(null)
  const [nextBillingDate, _setNextBillingDate] = useState('')
  const [paymentHistory, _setPaymentHistory] = useState<Array<{
    id: string
    date: string
    amount: number
    status: string
    description: string
  }>>([])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-700 bg-emerald-50'
      case 'cancelled': return 'text-red-700 bg-red-50'
      case 'past_due': return 'text-amber-700 bg-amber-50'
      default: return 'text-gray-700 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-emerald-600" />
      case 'rejected': return <AlertCircle className="w-4 h-4 text-red-600" />
      default: return <AlertCircle className="w-4 h-4 text-amber-600" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Estado de suscripción */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Estado de Suscripcion</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusColor(subscriptionStatus || '')}`}>
            {subscriptionStatus === 'active' ? 'Activa' : subscriptionStatus || 'Sin suscripción'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Proxima facturacion:</span>
            <p className="text-gray-900 font-medium">{nextBillingDate || '--'}</p>
          </div>
          <div>
            <span className="text-gray-500">Plan actual:</span>
            <p className="text-gray-900 font-medium">--</p>
          </div>
        </div>
      </div>

      {/* Historial de pagos */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3">Historial de Pagos</h3>
        <div className="space-y-2">
          {paymentHistory.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">Sin historial de pagos</p>
          ) : paymentHistory.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="flex items-center gap-3">
                {getStatusIcon(payment.status)}
                <div>
                  <p className="text-gray-900 font-medium">{payment.description}</p>
                  <p className="text-gray-500 text-sm">{payment.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-gray-900 font-medium">${payment.amount.toLocaleString()}</p>
                <p className="text-gray-500 text-sm capitalize">{payment.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gestión de suscripción */}
      <div className="flex gap-3">
        <button
          onClick={() => onPlanChange('paused')}
          className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl shadow-sm hover:bg-gray-100 transition-colors"
        >
          Pausar suscripcion
        </button>
        <button
          onClick={() => onPlanChange('cancelled')}
          className="flex-1 px-4 py-2 border border-red-200 text-red-700 rounded-xl shadow-sm hover:bg-red-50 transition-colors"
        >
          Cancelar suscripcion
        </button>
      </div>
    </div>
  )
}
