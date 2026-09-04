import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, MapPin, CheckCircle2, Stethoscope } from 'lucide-react';
import { formatArsFromCents, formatBrlFromCents } from '@/lib/payments/money';
import type { Doctor } from './types';

function getInitials(name?: string): string {
  if (!name) return 'DR';
  const clean = name.replace(/^(Dr\.|Dra\.|Doctor|Doctora)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface DoctorCardProps {
  doctor: Doctor;
  index: number;
  compact?: boolean;
  locale?: 'es' | 'pt';
}

export function DoctorCard({ doctor, index, compact = false, locale = 'es' }: DoctorCardProps) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = Boolean(doctor.photoUrl && !imgError);

  const isAvailableToday = doctor.availability === 'today';
  const isAvailableTomorrow = doctor.availability === 'tomorrow';

  const isBrazilDoctor = Boolean(
    doctor.matricula?.includes('CRM') ||
    doctor.city?.includes('Brasil') ||
    doctor.city?.includes('SP') ||
    doctor.city?.includes('RJ') ||
    (locale === 'pt' && !doctor.matricula?.includes('MN') && !doctor.matricula?.includes('MP'))
  );
  const hasValidPrice = Boolean(doctor.price && doctor.price > 0);
  const priceFormatted = hasValidPrice
    ? (isBrazilDoctor ? formatBrlFromCents(doctor.price) : formatArsFromCents(doctor.price))
    : (locale === 'pt' ? 'Valor a confirmar' : 'Valor a confirmar');

  const compactSubtitle = [doctor.hospital, doctor.university || doctor.city].filter(Boolean).join(' • ');

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
          {hasPhoto ? (
            <img
              src={doctor.photoUrl ?? ''}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 text-white select-none relative overflow-hidden group-hover:scale-105 transition-transform duration-300">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-sky-500/25 via-transparent to-transparent pointer-events-none" />
              <div className="size-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shadow-xs mb-0.5">
                <span className="text-xs font-black text-sky-400 tracking-tight">
                  {getInitials(doctor.name)}
                </span>
              </div>
              <span className="text-[8px] font-bold tracking-wider text-slate-300 uppercase">
                {locale === 'pt' ? 'Médico' : 'Médico'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col flex-grow min-w-0 justify-between h-full py-0.5">
          <div>
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight truncate">
                {doctor.name}
              </h3>
              {typeof doctor.rating === 'number' && !isNaN(doctor.rating) && (
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 shrink-0">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  <span>{doctor.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-sky-600 truncate">
              {doctor.specialty}
            </p>
            {compactSubtitle ? (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {compactSubtitle}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
            <div>
              {hasValidPrice && (
                <span className="text-[10px] text-slate-400 block -mb-0.5">
                  {locale === 'pt' ? 'A partir de' : 'Desde'}
                </span>
              )}
              <span className={hasValidPrice ? "text-xs md:text-sm font-black text-slate-900" : "text-xs font-semibold text-slate-400"}>
                {priceFormatted}
              </span>
            </div>
            <a
              href={`/patients/appointments?openModal=true&doctor=${doctor.id}`}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-sky-600 text-white text-xs font-bold rounded-full transition-all duration-200 shadow-sm active:scale-95 text-center"
            >
              {locale === 'pt' ? 'Agendar' : 'Agendar'}
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
        {hasPhoto ? (
          <motion.img
            src={doctor.photoUrl ?? ''}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white select-none relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-sky-500/20 via-transparent to-transparent pointer-events-none" />
            <div className="size-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shadow-xl mb-3">
              <Stethoscope className="size-5 text-sky-400 mb-1" />
              <span className="text-lg font-black tracking-tight text-white">
                {getInitials(doctor.name)}
              </span>
            </div>
            <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
              {doctor.specialty || (locale === 'pt' ? 'Profissional da Saúde' : 'Profesional Médico')}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">AutaMédica</span>
          </div>
        )}
        
        {/* Top Badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          {doctor.verified && (
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-medium text-sky-700 shadow-sm border border-sky-100/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
              <span>{locale === 'pt' ? 'Verificado' : 'Verificado'}</span>
            </div>
          )}
        </div>
        {typeof doctor.rating === 'number' && !isNaN(doctor.rating) && (
          <div className="absolute top-4 right-4">
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold text-slate-800 shadow-sm border border-slate-100/40">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{doctor.rating.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-5 flex flex-col flex-grow">
        <div className="mb-3">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight mb-1">
            {doctor.name}
          </h3>
          <p className="text-sky-600 font-medium text-sm">
            {doctor.specialty}
          </p>
        </div>

        {(doctor.matricula || doctor.city) && (
          <div className="flex items-start gap-1.5 text-slate-500 text-xs mb-4">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              {[doctor.matricula, doctor.city].filter(Boolean).join(' • ')}
            </p>
          </div>
        )}

        {/* Pricing */}
        <div className="mb-4">
          {hasValidPrice ? (
            <p className="text-sm text-slate-500">
              {locale === 'pt' ? 'A partir de' : 'Desde'}{' '}
              <span className="text-lg font-bold text-sky-600">{priceFormatted}</span>
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-400">
              {locale === 'pt' ? 'Valor a confirmar' : 'Valor a confirmar'}
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
            {isAvailableToday ? (locale === 'pt' ? 'Disponível hoje' : 'Disponible hoy') : 
             isAvailableTomorrow ? (locale === 'pt' ? 'Amanhã' : 'Mañana') : 
             (locale === 'pt' ? 'Completo' : 'Completo')}
          </div>
        </div>

        {/* Languages */}
        {doctor.languages && doctor.languages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {doctor.languages.slice(0, 3).map((lang) => (
              <span key={lang} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                {lang}
              </span>
            ))}
          </div>
        )}

        {/* Experience */}
        {(doctor.experienceYears || doctor.hospital || doctor.university) && (
          <div className="mt-auto pt-4 border-t border-slate-100">
            <p className="text-[13px] text-slate-500 leading-tight">
              {doctor.experienceYears ? (
                <>
                  <span className="font-semibold text-slate-700">
                    {doctor.experienceYears} {locale === 'pt' ? 'anos' : 'años'}
                  </span>{' '}
                  {locale === 'pt' ? 'de experiência' : 'de experiencia'}<br/>
                </>
              ) : null}
              {[doctor.hospital, doctor.university].filter(Boolean).join(' • ')}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 space-y-2 lg:opacity-0 lg:h-0 lg:overflow-hidden group-hover:opacity-100 group-hover:h-[88px] transition-all duration-300">
          <a
            href={`/patients/appointments?openModal=true&doctor=${doctor.id}`}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm shadow-sm inline-block text-center"
          >
            {locale === 'pt' ? 'Agendar consulta' : 'Agendar consulta'}
          </a>
          <a
            href={`/patients/appointments?type=telemedicine`}
            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2.5 rounded-xl transition-colors text-sm inline-block text-center"
          >
            {locale === 'pt' ? 'Ver perfil' : 'Ver perfil'}
          </a>
        </div>
      </div>
    </motion.div>
  );
}
