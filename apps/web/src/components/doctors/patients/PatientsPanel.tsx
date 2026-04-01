/**
 * Panel de gestión de pacientes para el portal de doctores.
 * Arquitectura: UI Layer.
 * Consume hooks de la capa Hook/Controller.
 */
'use client'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/Input'
import { LoadingState } from '@/components/ui/LoadingState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { useDoctorPatients } from '@/hooks/doctors/useRealPatients'
import { logger } from '@autamedica/shared'
import { Search, UserCheck, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface PatientsPanelProps {
  doctorUserId?: string
  onSelectPatient?: (patientId: string) => void
}

export function PatientsPanel({ doctorUserId, onSelectPatient }: PatientsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')

  // El hook ahora delega a Service -> Repo. El componente no sabe nada de Supabase.
  const { patients, loading, error, refetch } = useDoctorPatients(doctorUserId ?? '')

  const { user } = useAuthenticatedUser()
  const { appointments } = useDoctorAppointments(user?.doctorProfileId)

  const upcomingAppointmentsCount = useMemo(() => {
    const now = Date.now()
    return appointments.filter(a =>
      (a.status === 'scheduled' || a.status === 'confirmed') &&
      Date.parse(a.start_time) > now
    ).length
  }, [appointments])

  const patientsWithHistoryCount = useMemo(() => {
    return patients.filter(p => p.profile?.first_name && p.profile?.last_name).length
  }, [patients])

  // Lógica de presentación (filtrado local) se queda en el componente (o hook si fuera compleja)
  const filteredPatients = useMemo(() => {
    if (!searchTerm) return patients
    const s = searchTerm.toLowerCase()
    return patients.filter((p) => {
      const pName = `${p.profile?.first_name ?? ''} ${p.profile?.last_name ?? ''}`.toLowerCase()
      const pEmail = p.profile?.email?.toLowerCase() ?? ''
      return pName.includes(s) || pEmail.includes(s)
    })
  }, [patients, searchTerm])

  if (loading && patients.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="p-8">
              <LoadingState message="Cargando lista de pacientes..." />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && patients.length === 0) {
    return (
      <ErrorState
        title="Error al cargar pacientes"
        message={error}
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Sección */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Mis Pacientes</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1 font-semibold">
            {patients.length} Pacientes Asignados
          </Badge>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-all active:scale-95"
          >
            Sincronizar
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pacientes Propios</p>
              <h3 className="text-2xl font-bold">{patients.length}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <UserCheck className="h-6 w-6 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Historias Clínicas</p>
              <h3 className="text-2xl font-bold">{patientsWithHistoryCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/5 to-transparent border-blue-500/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
              <UserPlus className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Turnos Próximos</p>
              <h3 className="text-2xl font-bold">{upcomingAppointmentsCount}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Pacientes */}
      <Card className="overflow-hidden border-muted/40">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 border-b bg-muted/20 p-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, apellido o email..."
                className="pl-9 bg-background/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold">Paciente</TableHead>
                  <TableHead className="font-bold">Contacto</TableHead>
                  <TableHead className="font-bold">Género</TableHead>
                  <TableHead className="font-bold">Fécha Nac.</TableHead>
                  <TableHead className="text-right font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Users className="h-8 w-8 opacity-20" />
                        <p>{searchTerm ? 'No hay coincidencias para tu búsqueda.' : 'Aún no tienes pacientes asignados.'}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPatients.map((patient) => (
                    <TableRow key={patient.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary font-bold border border-primary/20">
                            {(patient.profile?.first_name?.[0] ?? '') + (patient.profile?.last_name?.[0] ?? '') || '?'}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {patient.profile?.first_name || patient.profile?.last_name
                                ? `${patient.profile?.first_name ?? ''} ${patient.profile?.last_name ?? ''}`.trim()
                                : <span className="text-muted-foreground italic">{patient.profile?.email ?? 'Paciente sin nombre'}</span>
                              }
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">ID: {patient.id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{patient.profile?.email || 'Sin email'}</span>
                          <span className="text-xs text-muted-foreground">{patient.profile?.phone || 'Sin teléfono'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize bg-background">
                          {patient.gender || 'Sin especificar'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {patient.date_of_birth 
                          ? new Date(patient.date_of_birth).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                          : 'Sin registrar'}
                      </TableCell>
                      <TableCell className="text-right">
                        <button 
                          className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground font-medium text-xs transition-all active:scale-95"
                          onClick={() => onSelectPatient?.(patient.id) ?? logger.info('Ver ficha paciente', patient.id)}
                        >
                          Ver Ficha
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
