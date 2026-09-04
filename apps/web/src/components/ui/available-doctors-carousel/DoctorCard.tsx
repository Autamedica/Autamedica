import React from 'react';
import { motion } from 'framer-motion';
import { Star, MapPin, CheckCircle2 } from 'lucide-react';
import type { Doctor } from './types';

interface DoctorCardProps {
  doctor: Doctor;
  index: number;
  compact?: boolean;
}

export function DoctorCard({ doctor, index, compact = false }: DoctorCardProps) {
  const isAvailableToday = doctor.availability === 'today';
  const isAvailableTomorrow = doctor.availability === 'tomorrow';

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35, delay: index * 0.05 }}
        whileHover={{ y: -3 }}
        className="group relative flex items-center bg-white rounded-[22px] border border-slate-200/70 p-3.5 w-[310px] md:w-[325px] shrink-0 gap-3.5 overflow-hidden shadow-xs hover:shadow-md hover:border-sky-300 transition-all duration-200"
      >
        <div className="relative size-20 shrink-0 rounded-[18px] overflow-hidden bg-slate-100 ring-1 ring-slate-200/60">
          <img
            src={doctor.photoUrl || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300'}
            alt={doctor.name}
            loading="lazy"
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        <div className="flex flex-col flex-grow min-w-0 justify-between h-full py-0.5">
          <div>
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight truncate">
                {doctor.name}
              </h3>
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 shrink-0">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                <span>{doctor.rating.toFixed(1)}</span>
              </div>
            </div>
            <p className="text-xs font-semibold text-[#0B6CFF] truncate">
              {doctor.specialty}
            </p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {doctor.hospital ? `${doctor.hospital} • ` : ''}{doctor.university || doctor.city}
            </p>
          </div>

          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
            <div>
              <span className="text-[10px] text-slate-400 block -mb-0.5">Desde</span>
              <span className="text-xs md:text-sm font-black text-slate-900">
                {doctor.price ? `$${doctor.price.toLocaleString('es-AR')}` : 'A confirmar'}
              </span>
            </div>
            <a
              href={`/patients/appointments?openModal=true&doctor=${doctor.id}`}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-[#0B6CFF] text-white text-xs font-bold rounded-full transition-all duration-200 shadow-sm active:scale-95 text-center"
            >
              Agendar
            </a>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: "easeOut" }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="group relative flex flex-col bg-white rounded-[28px] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:border-sky-200/50 transition-all duration-300 w-[300px] shrink-0 snap-center md:snap-start"
    >
      {/* Photo Section */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-50">
        <motion.img
          src={doctor.photoUrl}
          alt={doctor.name}
          loading="lazy"
          className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
        />
        
        {/* Top Badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          {doctor.verified && (
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-medium text-sky-700 shadow-sm border border-sky-100/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
              <span>Verificado</span>
            </div>
          )}
        </div>
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold text-slate-800 shadow-sm border border-slate-100/40">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{doctor.rating.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-5 flex flex-col flex-grow">
        <div className="mb-3">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight mb-1">
            {doctor.name}
          </h3>
          <p className="text-[#0B6CFF] font-medium text-sm">
            {doctor.specialty}
          </p>
        </div>

        <div className="flex items-start gap-1.5 text-slate-500 text-xs mb-4">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            {doctor.matricula} &bull; {doctor.city}
          </p>
        </div>

        {/* Pricing */}
        <div className="mb-4">
          {doctor.price ? (
            <p className="text-sm text-slate-500">
              Desde <span className="text-lg font-bold text-[#0B6CFF]">${doctor.price.toLocaleString('es-AR')}</span>
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-400">
              Valor a confirmar
            </p>
          )}
        </div>

        {/* Availability */}
        <div className="mb-4">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            ${isAvailableToday ? 'bg-sky-50 text-sky-700' : 
              isAvailableTomorrow ? 'bg-amber-50 text-amber-700' : 
              'bg-red-50 text-red-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full 
              ${isAvailableToday ? 'bg-sky-500' : 
                isAvailableTomorrow ? 'bg-amber-500' : 
                'bg-red-500'}`}></span>
            {isAvailableToday ? 'Disponible hoy' : 
             isAvailableTomorrow ? 'Mañana' : 'Completo'}
          </div>
        </div>

        {/* Languages */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {doctor.languages.slice(0, 3).map((lang) => (
            <span key={lang} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
              {lang}
            </span>
          ))}
        </div>

        {/* Experience */}
        <div className="mt-auto pt-4 border-t border-slate-100">
          <p className="text-[13px] text-slate-500 leading-tight">
            <span className="font-semibold text-slate-700">{doctor.experienceYears} años</span> de experiencia<br/>
            {doctor.hospital} &bull; {doctor.university}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 space-y-2 lg:opacity-0 lg:h-0 lg:overflow-hidden group-hover:opacity-100 group-hover:h-[88px] transition-all duration-300">
          <a
            href={`/patients/appointments?openModal=true&doctor=${doctor.id}`}
            className="w-full bg-[#0B6CFF] hover:bg-[#123B8F] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm shadow-sm inline-block text-center"
          >
            Agendar consulta
          </a>
          <a
            href={`/patients/appointments?type=telemedicine`}
            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2.5 rounded-xl transition-colors text-sm inline-block text-center"
          >
            Ver perfil
          </a>
        </div>
      </div>
    </motion.div>
  );
}
