'use client'

import { useEffect, useState } from 'react'
import { Award, Star, TrendingUp, Users, Clock, ThumbsUp, FileText, Medal, Crown, Trophy, Loader2 } from 'lucide-react'

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
  }
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

  useEffect(() => {
    fetch('/api/doctors/ranking')
      .then(res => res.json())
      .then(json => {
        if (json.ok) {
          setData(json.data)
        } else {
          setError(json.error ?? 'Error al cargar ranking')
        }
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="h-full bg-[#101d32] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="h-full bg-[#101d32] flex items-center justify-center text-slate-400">
        <p>{error ?? 'Sin datos'}</p>
      </div>
    )
  }

  const { current_doctor, ranked_doctors } = data
  const metrics = current_doctor.metrics
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
      default: return 'from-slate-600 to-slate-800 text-slate-100'
    }
  }

  const getRankIcon = (rank: number | null) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />
    if (rank === 2) return <Trophy className="w-5 h-5 text-slate-400" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return <span className="text-lg font-bold text-slate-400">#{rank ?? '-'}</span>
  }

  const getDoctorName = (doc: RankedDoctor) => {
    if (doc.first_name || doc.last_name) {
      return `${doc.first_name ?? ''} ${doc.last_name ?? ''}`.trim()
    }
    return 'Médico'
  }

  return (
    <div className="h-full bg-[#101d32] text-slate-100">
      <div className="p-6 border-b border-slate-800/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Award className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Sistema de Ranking</h1>
              <p className="text-sm text-slate-400">Evaluación y reconocimiento del desempeño médico</p>
            </div>
          </div>
          {metrics && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold text-amber-400">
                  {metrics.rank_position ? `#${metrics.rank_position}` : '-'}
                </p>
                <p className="text-sm text-slate-400">Tu posición</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-100">{metrics.overall_score}</p>
                <p className="text-sm text-slate-400">Puntuación</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex h-[calc(100%-100px)]">
        {/* Panel de métricas personales */}
        <div className="w-1/2 border-r border-slate-800/60 p-6 overflow-y-auto">
          <h2 className="text-lg font-medium text-slate-100 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Tu Desempeño
          </h2>

          {!hasMetrics ? (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-6 text-center">
              <TrendingUp className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 mb-1">Sin evaluaciones aún</p>
              <p className="text-sm text-slate-500">
                Las métricas se calcularán automáticamente cuando tus pacientes dejen evaluaciones después de sus consultas.
              </p>
              {metrics && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-slate-700/40 rounded-lg p-3">
                    <p className="text-2xl font-bold text-slate-200">{metrics.total_consultations}</p>
                    <p className="text-xs text-slate-400">Consultas totales</p>
                  </div>
                  <div className="bg-slate-700/40 rounded-lg p-3">
                    <p className="text-2xl font-bold text-slate-200">{metrics.completed_consultations}</p>
                    <p className="text-xs text-slate-400">Completadas</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-3">
                  <p className="text-2xl font-bold text-slate-200">{metrics.total_consultations}</p>
                  <p className="text-xs text-slate-400">Consultas</p>
                </div>
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-3">
                  <p className="text-2xl font-bold text-slate-200">{metrics.completion_rate}%</p>
                  <p className="text-xs text-slate-400">Tasa de completitud</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {categoryMetrics.map((metric) => (
                  <div key={metric.id} className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {metric.icon}
                        <span className="font-medium text-slate-100">{metric.name}</span>
                      </div>
                      <span className="text-lg font-bold text-slate-100">
                        {metric.value.toFixed(1)}
                        <span className="text-sm text-slate-400 font-normal">/{metric.maxValue}</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
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
              <h3 className="text-md font-medium text-slate-100 mb-3 flex items-center gap-2">
                <Medal className="w-4 h-4 text-amber-400" />
                Logros
              </h3>
              <div className="space-y-2">
                {current_doctor.badges.map((badge) => (
                  <div key={badge.id} className="flex items-center gap-3 p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getBadgeColor(badge.level)} flex items-center justify-center text-lg`}>
                      {BADGE_ICONS[badge.badge] ?? '🏅'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-100">{BADGE_LABELS[badge.badge] ?? badge.badge}</p>
                      <p className="text-xs text-slate-400">{badge.description}</p>
                      <p className="text-xs text-slate-500">
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

        {/* Panel de rankings */}
        <div className="w-1/2 p-6 overflow-y-auto">
          <h2 className="text-lg font-medium text-slate-100 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Ranking General
          </h2>

          {ranked_doctors.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-6 text-center">
              <Trophy className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300">Sin datos de ranking aún</p>
              <p className="text-sm text-slate-500 mt-1">
                El ranking se calculará cuando haya consultas completadas y evaluaciones de pacientes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ranked_doctors.map((doctor) => (
                <div
                  key={doctor.doctor_id}
                  className={`p-4 border rounded-lg transition-colors ${
                    doctor.is_current_user
                      ? 'bg-amber-900/20 border-amber-700/40 ring-1 ring-amber-500/30'
                      : 'bg-slate-800/40 border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {getRankIcon(doctor.rank_position)}
                      <div>
                        <h3 className="font-medium text-slate-100 flex items-center gap-2">
                          {getDoctorName(doctor)}
                          {doctor.is_current_user && (
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">TÚ</span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-400">{doctor.specialty ?? 'Sin especialidad'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-100">{doctor.overall_score}</p>
                      <p className="text-xs text-slate-400">puntos</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-slate-400">
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
