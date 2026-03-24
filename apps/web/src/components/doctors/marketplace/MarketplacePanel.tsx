
// @ts-nocheck
'use client'

import { useRealDoctors } from '@/hooks/doctors/useRealDoctors'
import { ARGENTINE_PROVINCES, MarketplaceDoctor, MarketplaceJobOffer } from '@/lib/doctors/types/marketplace'
import { MEDICAL_SPECIALTIES } from '@autamedica/types'
import {
    Briefcase,
    Clock,
    DollarSign,
    Eye,
    List,
    Map,
    MapPin,
    Search,
    Users
} from 'lucide-react'
import { useState } from 'react'
import { LeafletMap } from './LeafletMap'

type DoctorProfileCandidate = {
  first_name?: string | null
  last_name?: string | null
  firstName?: string | null
  lastName?: string | null
}

interface MarketplacePanelProps {
  locale?: string
}

export function MarketplacePanel({ locale }: MarketplacePanelProps = {}) {
  const intlLocale = locale === 'pt' ? 'pt-BR' : 'es-AR'
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItem, setSelectedItem] = useState<MarketplaceJobOffer | MarketplaceDoctor | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [showUrgentOnly, setShowUrgentOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'salary' | 'applications'>('date')

  const { doctors, loading: _doctorsLoading, error: _doctorsError } = useRealDoctors()

  const jobOffers: MarketplaceJobOffer[] = []

  const mappedDoctors: MarketplaceDoctor[] = (doctors || []).map(doc => {
    const profile = doc.profile as DoctorProfileCandidate | null | undefined
    const name = profile
      ? `${profile.first_name || profile.firstName || ''} ${profile.last_name || profile.lastName || ''}`.trim() || 'Médico'
      : 'Médico'

    return {
      id: doc.id,
      name: name,
      specialties: [doc.specialty].filter(Boolean) as string[],
      location: {
        city: '',
        province: '',
        country: 'Argentina',
        coordinates: { lat: 0, lng: 0 }
      },
      rating: 0,
      experience: 0,
      hourlyRate: { amount: 0, currency: 'ARS' },
      availableForHiring: false,
      responseTime: 0,
      isUrgentAvailable: false,
      isOnline: false,
      workArrangement: 'flexible',
      languages: [] as string[],
      verificationStatus: 'pending',
      licenseNumber: '',
      offersDirectServices: false,
      totalJobs: 0,
      successRate: 0
    }
  })

  const filteredJobs = jobOffers.filter(job => {
    const matchesSearch = searchTerm === '' ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.location.city.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesSpecialty = selectedSpecialty === 'all' || job.specialty === selectedSpecialty
    const matchesLocation = selectedLocation === 'all' || job.location.province === selectedLocation
    const matchesType = selectedType === 'all' || job.type === selectedType
    const matchesUrgent = !showUrgentOnly || job.urgent

    return matchesSearch && matchesSpecialty && matchesLocation && matchesType && matchesUrgent
  })

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    switch (sortBy) {
      case 'salary':
        return b.salary.max - a.salary.max
      case 'applications':
        return b.applicationsCount - a.applicationsCount
      case 'date':
      default:
        return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
    }
  })

  const formatSalary = (job: MarketplaceJobOffer) => {
    const { min, max, currency, period } = job.salary
    if (currency === 'ARS') {
      return `$${min.toLocaleString(intlLocale)} - $${max.toLocaleString(intlLocale)}/${period}`
    }
    return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}/${period}`
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 24) {
      return `${diffInHours}h`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays}d`
    }
  }

  const handleItemSelect = (item: MarketplaceJobOffer | MarketplaceDoctor) => {
    setSelectedItem(item)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-am-surface-50 text-am-surface-900">
      <div className="shrink-0 p-6 border-b border-am-surface-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-am-primary-50 rounded-lg">
              <MapPin className="w-6 h-6 text-am-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-am-surface-900">Marketplace Médico</h1>
              <p className="text-sm text-am-surface-500">Encuentra trabajo médico en Argentina</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-am-primary-600 text-white'
                  : 'bg-white text-am-surface-700 border border-am-surface-200 hover:bg-am-surface-100'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'map'
                  ? 'bg-am-primary-600 text-white'
                  : 'bg-white text-am-surface-700 border border-am-surface-200 hover:bg-am-surface-100'
              }`}
            >
              <Map className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'map' ? (
        <div className="flex min-h-0 flex-1">
          {/* Panel lateral de filtros en vista mapa */}
          <div className="w-80 border-r border-am-surface-200 p-4 overflow-y-auto">
            <div className="space-y-4">
              {/* Búsqueda */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-am-surface-500" />
                <input
                  type="text"
                  placeholder="Buscar trabajos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-am-surface-200 rounded-lg text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                />
              </div>

              {/* Filtros */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-am-surface-700 mb-2">Especialidad</label>
                  <select
                    value={selectedSpecialty}
                    onChange={(e) => setSelectedSpecialty(e.target.value)}
                    className="w-full bg-white border border-am-surface-200 rounded-lg text-am-surface-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                  >
                    <option value="all">Todas las especialidades</option>
                    {Object.values(MEDICAL_SPECIALTIES).map(specialty => (
                      <option key={specialty} value={specialty}>{specialty}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-am-surface-700 mb-2">Provincia</label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-white border border-am-surface-200 rounded-lg text-am-surface-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                  >
                    <option value="all">Todas las provincias</option>
                    {ARGENTINE_PROVINCES.map(province => (
                      <option key={province} value={province}>{province}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-am-surface-700 mb-2">Tipo de trabajo</label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full bg-white border border-am-surface-200 rounded-lg text-am-surface-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                  >
                    <option value="all">Todos los tipos</option>
                    <option value="full-time">Tiempo completo</option>
                    <option value="part-time">Medio tiempo</option>
                    <option value="contract">Contrato</option>
                    <option value="locum">Locum tenens</option>
                    <option value="remote">Remoto</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="urgent-only"
                    checked={showUrgentOnly}
                    onChange={(e) => setShowUrgentOnly(e.target.checked)}
                    className="rounded border-am-surface-300 bg-white text-am-primary-600 focus:ring-am-primary-500"
                  />
                  <label htmlFor="urgent-only" className="text-sm text-am-surface-700">
                    Solo urgentes
                  </label>
                </div>
              </div>

              {/* Estadísticas */}
              <div className="bg-am-surface-50 border border-am-surface-200 rounded-2xl p-3 shadow-am-sm">
                <h3 className="text-sm font-medium text-am-surface-900 mb-2">Estadísticas</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-am-surface-500">Total trabajos:</span>
                    <p className="text-am-surface-900 font-semibold">{filteredJobs.length}</p>
                  </div>
                  <div>
                    <span className="text-am-surface-500">Urgentes:</span>
                    <p className="text-red-700 font-semibold">{filteredJobs.filter(j => j.urgent).length}</p>
                  </div>
                  <div>
                    <span className="text-am-surface-500">Remotos:</span>
                    <p className="text-am-primary-700 font-semibold">{filteredJobs.filter(j => j.remote).length}</p>
                  </div>
                  <div>
                    <span className="text-am-surface-500">Nuevos hoy:</span>
                    <p className="text-emerald-700 font-semibold">
                      {filteredJobs.filter(j => {
                        const today = new Date()
                        const jobDate = new Date(j.publishedDate)
                        return today.toDateString() === jobDate.toDateString()
                      }).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mapa interactivo */}
          <div className="flex-1 p-4">
            <LeafletMap
              jobs={filteredJobs}
              doctors={mappedDoctors}
              selectedItem={selectedItem?.id}
              onItemSelect={handleItemSelect}
              filters={{
                specialty: selectedSpecialty !== 'all' ? selectedSpecialty : undefined,
                location: selectedLocation !== 'all' ? selectedLocation : undefined,
                urgent: showUrgentOnly
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Lista de trabajos */}
          <div className="w-full lg:w-1/2 border-r border-am-surface-200 p-4">
            {/* Controles de lista */}
            <div className="mb-4 space-y-3">
              {/* Búsqueda */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-am-surface-500" />
                <input
                  type="text"
                  placeholder="Buscar trabajos médicos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-am-surface-200 rounded-lg text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                />
              </div>

              {/* Filtros rápidos */}
              <div className="flex gap-2 overflow-x-auto">
                <select
                  value={selectedSpecialty}
                  onChange={(e) => setSelectedSpecialty(e.target.value)}
                  className="bg-white border border-am-surface-200 rounded-lg text-am-surface-900 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                >
                  <option value="all">Todas</option>
                  {Object.values(MEDICAL_SPECIALTIES).slice(0, 5).map(specialty => (
                    <option key={specialty} value={specialty}>{specialty}</option>
                  ))}
                </select>

                <button
                  onClick={() => setShowUrgentOnly(!showUrgentOnly)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    showUrgentOnly
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-am-surface-700 border border-am-surface-200 hover:bg-am-surface-100'
                  }`}
                >
                  Urgentes
                </button>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'salary' | 'applications')}
                  className="bg-white border border-am-surface-200 rounded-lg text-am-surface-900 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-am-primary-500"
                >
                  <option value="date">Más recientes</option>
                  <option value="salary">Mejor pagados</option>
                  <option value="applications">Más populares</option>
                </select>
              </div>
            </div>

            {/* Lista de trabajos */}
            <div className="space-y-3 overflow-y-auto max-h-[500px]">
              {sortedJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => handleItemSelect(job)}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all duration-am-fast ease-am-ease shadow-am-sm hover:-translate-y-0.5 hover:shadow-am-card-hover ${
                    selectedItem?.id === job.id
                      ? 'border-am-primary-300 bg-am-primary-50'
                      : 'border-am-surface-200 bg-white hover:bg-am-surface-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-am-surface-900">{job.title}</h3>
                      <p className="text-sm text-am-surface-500">{job.company}</p>
                    </div>
                    {job.urgent && (
                      <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                        URGENTE
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-am-surface-500 mb-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {job.location.city}, {job.location.province}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      {job.type === 'full-time' ? 'Tiempo completo' :
                       job.type === 'part-time' ? 'Medio tiempo' :
                       job.type === 'contract' ? 'Contrato' :
                       job.type === 'locum' ? 'Locum tenens' : 'Remoto'}
                    </span>
                    {job.remote && (
                      <span className="bg-am-primary-50 text-am-primary-700 text-xs px-2 py-1 rounded">
                        Remoto
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-bold text-am-primary-600">
                        {formatSalary(job)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-am-surface-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {job.applicationsCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {job.viewsCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getTimeAgo(job.publishedDate)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detalles del trabajo */}
          <div className="w-full lg:w-1/2 p-6 overflow-y-auto">
            {selectedItem && 'title' in selectedItem ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-am-surface-900">{selectedItem.title}</h2>
                      <p className="text-am-surface-500">{selectedItem.company}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <MapPin className="w-4 h-4 text-am-surface-500" />
                        <span className="text-am-surface-700">{selectedItem.location.city}, {selectedItem.location.province}</span>
                      </div>
                    </div>
                    {selectedItem.urgent && (
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                        URGENTE
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-am-surface-50 border border-am-surface-200 rounded-2xl p-4 shadow-am-sm">
                      <DollarSign className="w-5 h-5 text-am-primary-600 mb-2" />
                      <p className="text-sm text-am-surface-500">Salario</p>
                      <p className="text-am-surface-900 font-medium">{formatSalary(selectedItem)}</p>
                    </div>
                    <div className="bg-am-surface-50 border border-am-surface-200 rounded-2xl p-4 shadow-am-sm">
                      <Briefcase className="w-5 h-5 text-am-primary-700 mb-2" />
                      <p className="text-sm text-am-surface-500">Tipo</p>
                      <p className="text-am-surface-900 font-medium">{selectedItem.type}</p>
                    </div>
                    <div className="bg-am-surface-50 border border-am-surface-200 rounded-2xl p-4 shadow-am-sm">
                      <Users className="w-5 h-5 text-purple-700 mb-2" />
                      <p className="text-sm text-am-surface-500">Aplicaciones</p>
                      <p className="text-am-surface-900 font-medium">{selectedItem.applicationsCount}</p>
                    </div>
                    <div className="bg-am-surface-50 border border-am-surface-200 rounded-2xl p-4 shadow-am-sm">
                      <Clock className="w-5 h-5 text-amber-700 mb-2" />
                      <p className="text-sm text-am-surface-500">Publicado</p>
                      <p className="text-am-surface-900 font-medium">{getTimeAgo(selectedItem.publishedDate)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-am-surface-900 mb-3">Descripción</h3>
                  <p className="text-am-surface-700 leading-relaxed">{selectedItem.description}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-am-surface-900 mb-3">Requisitos</h3>
                  <ul className="space-y-2">
                    {selectedItem.requirements.map((req, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-am-primary-600 mt-2 flex-shrink-0" />
                        <span className="text-am-surface-700">{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-am-surface-900 mb-3">Beneficios</h3>
                  <ul className="space-y-2">
                    {selectedItem.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-am-primary-600 mt-2 flex-shrink-0" />
                        <span className="text-am-surface-700">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3 pt-4">
                  <button className="flex-1 bg-am-primary-600 hover:bg-am-primary-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
                    Aplicar ahora
                  </button>
                  <button className="border border-am-surface-200 hover:bg-am-surface-50 text-am-surface-700 font-medium py-3 px-4 rounded-lg transition-colors">
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <MapPin className="w-12 h-12 text-am-surface-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-am-surface-700 mb-2">Selecciona un trabajo</h3>
                  <p className="text-am-surface-500">
                    Elige una oferta de trabajo de la lista para ver los detalles completos
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
