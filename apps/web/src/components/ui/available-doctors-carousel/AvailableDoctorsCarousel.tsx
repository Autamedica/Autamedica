import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ShieldCheck, Lock, Activity, HeartPulse } from 'lucide-react';
import { DoctorCard } from './DoctorCard';
import type { Doctor } from './types';

interface CarouselProps {
  doctors?: Doctor[];
  isLoading?: boolean;
  compact?: boolean;
}

export function AvailableDoctorsCarousel({ doctors = [], isLoading = false, compact = false }: CarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dotsCount, setDotsCount] = useState(1);

  // Update dots count on resize
  useEffect(() => {
    const updateDots = () => {
      const cardsPerView = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 2 : 1;
      setDotsCount(Math.max(1, Math.ceil(doctors.length / cardsPerView)));
    };
    
    updateDots();
    window.addEventListener('resize', updateDots);
    return () => window.removeEventListener('resize', updateDots);
  }, [doctors.length]);

  // Slow continuous drift animation (pauses on hover/interaction)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || isHovered || isLoading || doctors.length === 0) return;

    let animationFrameId: number;
    const speed = 0.55;

    const step = () => {
      if (container) {
        container.scrollLeft += speed;
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (container.scrollLeft >= maxScroll - 1) {
          container.scrollLeft = 0;
        }
      }
      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHovered, isLoading, doctors.length]);

  const handleNext = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollAmount = compact ? 335 : 324;
    const isEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10;
    
    if (isEnd) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
      setActiveIndex(0);
    } else {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setActiveIndex((prev) => Math.min(prev + 1, dotsCount - 1));
    }
  };

  const handlePrev = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollAmount = compact ? 335 : 324;
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    setActiveIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollPercentage = container.scrollLeft / (container.scrollWidth - container.clientWidth);
    const newIndex = Math.round(scrollPercentage * (dotsCount - 1));
    if (!isNaN(newIndex) && newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  const features = [
    { icon: <ShieldCheck className="w-5 h-5" />, text: "Atención de calidad" },
    { icon: <Lock className="w-5 h-5" />, text: "Seguridad y privacidad" },
    { icon: <Activity className="w-5 h-5" />, text: "Tecnología médica" },
    { icon: <HeartPulse className="w-5 h-5" />, text: "Cuidado integral" }
  ];

  return (
    <section className={`w-full ${compact ? 'bg-transparent py-2 px-0' : 'bg-[#FAFBFC] py-16 px-4 md:px-8'} font-sans`}>
      <div className={`${compact ? 'w-full' : 'max-w-[1400px]'} mx-auto`}>
        {/* Header */}
        {compact ? (
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                Médicos disponibles
              </h2>
              <p className="text-slate-500 text-xs md:text-sm mt-0.5">
                Profesionales verificados listos para videoconsulta o turno programado.
              </p>
            </div>

            <a
              href="/patients/appointments?type=telemedicine"
              className="inline-flex items-center gap-1 text-xs md:text-sm font-bold text-[#0B6CFF] hover:text-[#0252cc] transition-colors"
            >
              <span>Ver todos</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight">Médicos disponibles</h2>
              <p className="text-slate-500 text-lg">Profesionales verificados listos para ayudarte hoy.</p>
            </motion.div>
            
            <a 
              href="/patients/appointments?type=telemedicine"
              className="text-[#0B6CFF] font-semibold hover:text-[#123B8F] transition-colors flex items-center gap-1 group"
            >
              Ver todos los médicos 
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </a>
          </div>
        )}

        {/* Carousel Container */}
        <div 
          className="relative group/carousel"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={() => setIsHovered(true)}
          onTouchEnd={() => setIsHovered(false)}
        >
          {/* Navigation Arrows */}
          <button 
            onClick={handlePrev}
            className="absolute left-[-16px] top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-md items-center justify-center text-[#0B6CFF] hover:bg-slate-50 transition-all opacity-0 group-hover/carousel:opacity-100 hidden md:flex disabled:opacity-0 border border-slate-200/80 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleNext}
            className="absolute right-[-16px] top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-md items-center justify-center text-[#0B6CFF] hover:bg-slate-50 transition-all opacity-0 group-hover/carousel:opacity-100 hidden md:flex border border-slate-200/80 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Scroll Area */}
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className={`flex gap-4 overflow-x-auto hide-scrollbar ${compact ? 'py-2 px-0.5' : 'gap-6 snap-x snap-mandatory pb-10 pt-4 px-2'}`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {isLoading ? (
              // Skeleton Loaders
              Array.from({ length: 4 }).map((_, i) => (
                compact ? (
                  <div key={`skel-${i}`} className="w-[310px] md:w-[325px] h-[92px] shrink-0 bg-white rounded-[22px] border border-slate-200/70 animate-pulse flex items-center p-3.5 gap-3.5 shadow-xs">
                    <div className="size-20 shrink-0 rounded-[18px] bg-slate-200" />
                    <div className="flex-grow space-y-2 py-1">
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 rounded w-1/2" />
                      <div className="h-3 bg-slate-200 rounded w-2/3" />
                    </div>
                  </div>
                ) : (
                  <div key={`skel-${i}`} className="w-[300px] h-[540px] shrink-0 bg-white rounded-[28px] border border-slate-100 animate-pulse flex flex-col overflow-hidden shadow-sm">
                    <div className="w-full aspect-[4/5] bg-slate-200" />
                    <div className="p-5 flex-grow space-y-4">
                      <div className="h-6 bg-slate-200 rounded w-3/4" />
                      <div className="h-4 bg-slate-200 rounded w-1/2" />
                      <div className="h-4 bg-slate-200 rounded w-5/6" />
                      <div className="mt-auto pt-4 border-t border-slate-100">
                        <div className="h-8 bg-slate-200 rounded w-full" />
                      </div>
                    </div>
                  </div>
                )
              ))
            ) : (
              doctors.map((doctor, idx) => (
                <DoctorCard key={doctor.id} doctor={doctor} index={idx} compact={compact} />
              ))
            )}
          </div>
          
          {/* Dots Indicator (non-compact only) */}
          {!compact && !isLoading && doctors.length > 0 && (
            <div className="flex justify-center gap-2 mt-2 mb-8">
              {Array.from({ length: dotsCount }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const cardsPerView = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 2 : 1;
                    if (scrollRef.current) {
                      scrollRef.current.scrollTo({ left: idx * cardsPerView * 324, behavior: 'smooth' });
                    }
                  }}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === activeIndex ? 'w-6 bg-gradient-to-r from-[#0B6CFF] to-[#123B8F]' : 'w-2 bg-slate-300 hover:bg-slate-400'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info Blocks Below (non-compact only) */}
        {!compact && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 mt-12 pt-12 border-t border-slate-200"
          >
            {features.map((feature, idx) => (
              <div key={idx} className="flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-14 h-14 bg-blue-50/80 rounded-2xl flex items-center justify-center text-[#0B6CFF] mb-4">
                  {feature.icon}
                </div>
                <p className="text-slate-700 font-semibold text-sm md:text-base">{feature.text}</p>
              </div>
            ))}
          </motion.div>
        )}
      </div>
      
      {/* Hide scrollbar styles injection */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
