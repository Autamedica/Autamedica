'use client'

import { useEffect, useState, useCallback } from 'react'
import { Award, Star, TrendingUp, Users, Clock, ThumbsUp, FileText, Medal, Crown, Trophy, ShieldAlert } from 'lucide-react'

interface RankingMetrics {
  doctor_id: string
  avg_rating: number
  total_reviews: number
  total_consultations: number
  completed_consultations: number
  completion_rate: number
  avg_punctuality: number
  avg_communication: number
  avg_professionalism: number
  avg_clinical_quality: number
  overall_score: number
  rank_position: number | null
}

interface Badge {
  id: string
  doctor_id: string
  badge: string
  level: 'bronze' | 'silver' | 'gold' | 'platinum'
  description: string
  earned_at: string
}

interface RankedDoctor {
  doctor_id: string
  avg_rating: number
  total_reviews: number
  total_consultations: number
  completed_consultations: number
  completion_rate: number
  overall_score: number
  rank_position: number | null
  specialty: string | null
  years_experience: number | null
  first_name: string | null
  last_name: string | null
  is_current_user: boolean
  badges: Badge[]
}

interface RankingData {
  current_doctor: {
    doctor_id: string
    specialty: string
    years_experience: number
    metrics: RankingMetrics | null
    badges: Badge[]
    review_count: number
  } | null
  ranked_doctors: RankedDoctor[]
}

const BADGE_LABELS: Record<string, string> = {
  clinical_excellence: 'Excelencia Clínica',
  patient_favorite: 'Favorito de Pacientes',
  punctuality_star: 'Puntualidad',
  high_volume: 'Alto Volumen',
  mentor: 'Mentor',
  early_adopter: 'Pionero Digital',
  zero_no_show: 'Cero Ausencias',
  telemedicine_pioneer: 'Pionero Telemedicina',
}

const BADGE_ICONS: Record<string, string> = {
  clinical_excellence: '🏆',
  patient_favorite: '❤️',
  punctuality_star: '⏰',
  high_volume: '📊',
  mentor: '👨‍🏫',
  early_adopter: '💡',
  zero_no_show: '✅',
  telemedicine_pioneer: '📹',
}

export function MedicalRankingPanel() {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRanking = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    try {
      const res = await fetch('/api/doctors/ranking', { credentials: 'include' })
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setError(null)
      } else if (isInitial) {
        const errMsg = res.status === 401
          ? 'unauthorized'
          : (json.error?.message ?? 'Error al cargar ranking')
        setError(errMsg)
      }
    } catch {
      if (isInitial) setError('Error de conexion')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRanking(true)
  }, [fetchRanking])

  useEffect(() => {
    const interval = setInterval(() => fetchRanking(false), 60_000)
    return () => clearInterval(interval)
  }, [fetchRanking])

  if (loading) {
    return (
      <div className="h-full bg-am-surface-50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 am-skeleton rounded-lg" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-48 am-skeleton rounded" />
            <div className="h-4 w-64 am-skeleton rounded" />
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/2 space-y-3">
            <div className="h-6 w-36 am-skeleton rounded" />
            <div className="h-24 am-skeleton rounded-2xl" />
            <div className="h-24 am-skeleton rounded-2xl" />
          </div>
          <div className="w-full lg:w-1/2 space-y-3">
            <div className="h-6 w-36 am-skeleton rounded" />
            <div className="h-20 am-skeleton rounded-2xl" />
            <div className="h-20 am-skeleton rounded-2xl" />
            <div className="h-20 am-skeleton rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-am-surface-200 bg-white p-12 text-center shadow-am-sm">
        <div className="relative mb-6">
          <div className="absolute -inset-6 rounded-full bg-amber-50/60" />
          <div className="absolute -inset-3 rounded-full bg-amber-50" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <ShieldAlert className="h-7 w-7 text-white" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-am-surface-900">
          {error === 'unauthorized' ? 'Sesion requerida' : 'Error al cargar ranking'}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-am-surface-500">
          {error === 'unauthorized'
            ? 'Inicia sesion para ver el ranking de medicos.'
            : (error ?? 'No se pudieron cargar los datos del ranking. Intenta recargar la pagina.')}
        </p>
      </div>
    )
  }

  const { current_doctor, ranked_doctors } = data
  const metrics = current_doctor?.metrics ?? null
  const hasMetrics = metrics && metrics.total_reviews > 0

  const categoryMetrics = hasMetrics ? [
    {
      id: 'satisfaction',
      name: 'Satisfacción',
      value: metrics.avg_rating,
      maxValue: 5,
      icon: <ThumbsUp className="w-4 h-4" />,
    },
    {
      id: 'clinical',
      name: 'Calidad Clínica',
      value: metrics.avg_clinical_quality,
      maxValue: 5,
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'communication',
      name: 'Comunicación',
      value: metrics.avg_communication,
      maxValue: 5,
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'punctuality',
      name: 'Puntualidad',
      value: metrics.avg_punctuality,
      maxValue: 5,
      icon: <Clock className="w-4 h-4" />,
    },
  ] : []

  const getBadgeColor = (level: string) => {
    switch (level) {
      case 'platinum': return 'from-slate-200 to-slate-400 text-slate-800'
      case 'gold': return 'from-yellow-400 to-yellow-600 text-yellow-900'
      case 'silver': return 'from-slate-300 to-slate-500 text-slate-800'
      case 'bronze': return 'from-amber-600 to-amber-800 text-amber-100'
      default: return 'from-am-surface-200 to-am-surface-400 text-am-surface-700'
    }
  }

  const getRankIcon = (rank: number | null) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />
    if (rank === 2) return <Trophy className="w-5 h-5 text-am-surface-400" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return <span className="text-lg font-bold text-am-surface-500">#{rank ?? '-'}</span>
  }

  const getDoctorName = (doc: RankedDoctor) => {
    if (doc.first_name || doc.last_name) {
      return `${doc.first_name ?? ''} ${doc.last_name ?? ''}`.trim()
    }
    return 'Médico'
  }

  return (
    <div className="h-full bg-am-surface-50 text-am-surface-900">
      <div className="p-6 border-b border-am-surface-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-am-doctor-50 rounded-lg">
              <Award className="w-6 h-6 text-am-doctor-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-am-surface-900">Sistema de Ranking</h1>
              <p className="text-sm text-am-surface-500">Evaluacion y reconocimiento del desempeno medico</p>
            </div>
          </div>
          {metrics && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold text-am-doctor-600">
                  {metrics.rank_position ? `#${metrics.rank_position}` : '-'}
                </p>
                <p className="text-sm text-am-surface-500">Tu posicion</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-am-surface-900">{metrics.overall_score}</p>
                <p className="text-sm text-am-surface-500">Puntuacion</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100%-100px)]">
        {/* Panel de metricas personales — solo si el usuario es doctor */}
        {current_doctor && (
          <div className="w-full lg:w-1/2 border-r border-am-surface-200 p-6 overflow-y-auto">
            <h2 className="text-lg font-medium text-am-surface-900 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-am-doctor-500" />
              Tu Desempeno
            </h2>

            {!hasMetrics ? (
              <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-6 text-center">
                <TrendingUp className="w-8 h-8 text-am-surface-400 mx-auto mb-3" />
                <p className="text-am-surface-700 mb-1">Sin evaluaciones aun</p>
                <p className="text-sm text-am-surface-400">
                  Las metricas se calcularan automaticamente cuando tus pacientes dejen evaluaciones despues de sus consultas.
                </p>
                {metrics && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-am-surface-50 rounded-2xl p-3">
                      <p className="text-2xl font-bold text-am-surface-800">{metrics.total_consultations}</p>
                      <p className="text-xs text-am-surface-500">Consultas totales</p>
                    </div>
                    <div className="bg-am-surface-50 rounded-2xl p-3">
                      <p className="text-2xl font-bold text-am-surface-800">{metrics.completed_consultations}</p>
                      <p className="text-xs text-am-surface-500">Completadas</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-3">
                    <p className="text-2xl font-bold text-am-surface-800">{metrics.total_consultations}</p>
                    <p className="text-xs text-am-surface-500">Consultas</p>
                  </div>
                  <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-3">
                    <p className="text-2xl font-bold text-am-surface-800">{metrics.completion_rate}%</p>
                    <p className="text-xs text-am-surface-500">Tasa de completitud</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  {categoryMetrics.map((metric) => (
                    <div key={metric.id} className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {metric.icon}
                          <span className="font-medium text-am-surface-900">{metric.name}</span>
                        </div>
                        <span className="text-lg font-bold text-am-surface-900">
                          {metric.value.toFixed(1)}
                          <span className="text-sm text-am-surface-500 font-normal">/{metric.maxValue}</span>
                        </span>
                      </div>
                      <div className="w-full bg-am-surface-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-am-doctor-500 to-am-doctor-600"
                          style={{ width: `${(metric.value / metric.maxValue) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Badges */}
            {current_doctor.badges.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-am-surface-900 mb-3 flex items-center gap-2">
                  <Medal className="w-4 h-4 text-am-doctor-500" />
                  Logros
                </h3>
                <div className="space-y-2">
                  {current_doctor.badges.map((badge) => (
                    <div key={badge.id} className="flex items-center gap-3 p-3 bg-white border border-am-surface-200 rounded-2xl shadow-am-sm">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getBadgeColor(badge.level)} flex items-center justify-center text-lg`}>
                        {BADGE_ICONS[badge.badge] ?? '🏅'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-am-surface-900">{BADGE_LABELS[badge.badge] ?? badge.badge}</p>
                        <p className="text-xs text-am-surface-500">{badge.description}</p>
                        <p className="text-xs text-am-surface-400">
                          {new Date(badge.earned_at).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize bg-gradient-to-br ${getBadgeColor(badge.level)}`}>
                        {badge.level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Panel de rankings — full width si no hay doctor, mitad si hay */}
        <div className={`${current_doctor ? 'w-full lg:w-1/2' : 'w-full'} p-6 overflow-y-auto`}>
          <h2 className="text-lg font-medium text-am-surface-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-am-doctor-500" />
            Ranking General
          </h2>

          {ranked_doctors.length === 0 ? (
            <div className="bg-white border border-am-surface-200 rounded-2xl shadow-am-sm p-6 text-center">
              <Trophy className="w-8 h-8 text-am-surface-400 mx-auto mb-3" />
              <p className="text-am-surface-700">Sin datos de ranking aun</p>
              <p className="text-sm text-am-surface-400 mt-1">
                El ranking se calculara cuando haya consultas completadas y evaluaciones de pacientes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ranked_doctors.map((doctor) => (
                <div
                  key={doctor.doctor_id}
                  className={`p-4 border rounded-2xl shadow-am-sm transition-colors ${
                    doctor.is_current_user
                      ? 'bg-am-doctor-50 border-am-doctor-200 ring-1 ring-am-doctor-300'
                      : 'bg-white border-am-surface-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {getRankIcon(doctor.rank_position)}
                      <div>
                        <h3 className="font-medium text-am-surface-900 flex items-center gap-2">
                          {getDoctorName(doctor)}
                          {doctor.is_current_user && (
                            <span className="text-xs bg-am-doctor-100 text-am-doctor-700 px-2 py-1 rounded-full">TU</span>
                          )}
                        </h3>
                        <p className="text-sm text-am-surface-500">{doctor.specialty ?? 'Sin especialidad'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-am-surface-900">{doctor.overall_score}</p>
                      <p className="text-xs text-am-surface-500">puntos</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-am-surface-500">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {doctor.avg_rating.toFixed(1)}/5
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {doctor.total_reviews} evaluaciones
                      </div>
                      {doctor.years_experience != null && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {doctor.years_experience} años
                        </div>
                      )}
                    </div>
                    {doctor.badges.length > 0 && (
                      <div className="flex items-center gap-1">
                        {doctor.badges.slice(0, 3).map((badge) => (
                          <div
                            key={badge.id}
                            className={`w-6 h-6 rounded bg-gradient-to-br ${getBadgeColor(badge.level)} flex items-center justify-center text-xs`}
                            title={BADGE_LABELS[badge.badge] ?? badge.badge}
                          >
                            {BADGE_ICONS[badge.badge] ?? '🏅'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
