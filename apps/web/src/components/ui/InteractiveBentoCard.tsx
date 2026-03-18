import React, { useEffect, useRef, useState } from 'react';

interface InteractiveBentoCardProps {
  title: string;
  description: string;
  iconSvg?: string;
  videoSrc?: string;
  imageSrc?: string;
  className?: string;
  isLarge?: boolean;
}

export const InteractiveBentoCard: React.FC<InteractiveBentoCardProps> = ({
  title,
  description,
  iconSvg,
  videoSrc,
  imageSrc,
  className = '',
  isLarge = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Force play on mobile where autoplay may be blocked
    const tryPlay = () => {
      video.play().catch(() => {
        // Silently ignore — browser policy blocks autoplay in this context
      });
    };
    tryPlay();
    video.addEventListener('pause', tryPlay);
    return () => video.removeEventListener('pause', tryPlay);
  }, [videoSrc]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A] p-8 transition-all duration-500 ease-out hover:border-white/20 hover:shadow-2xl hover:shadow-primary/20 group ${className} ${isLarge ? 'md:col-span-2 md:row-span-2 p-10' : ''}`}
      style={{
        background: isHovered
          ? 'radial-gradient(1000px circle at var(--mouse-x) var(--mouse-y), rgba(255,255,255,0.06), transparent 40%), #0A0A0A'
          : '#0A0A0A',
      }}
    >
      {/* Background Media Overlay */}
      {(videoSrc || imageSrc) && (
        <>
          <div className="absolute inset-0 z-0">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                autoPlay
                muted
                loop
                playsInline
                disablePictureInPicture
                preload="auto"
                className="h-full w-full object-cover opacity-[0.35] transition-opacity duration-700 group-hover:opacity-[0.55]"
              />
            ) : (
              <img
                src={imageSrc}
                alt=""
                className="h-full w-full object-cover opacity-[0.45] transition-all duration-700 group-hover:opacity-[0.65] group-hover:scale-105"
              />
            )}
          </div>
          <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent" />
        </>
      )}

      <div className="relative z-10 flex h-full flex-col justify-end">
        {iconSvg && (
          <div 
            className={`mb-6 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white backdrop-blur-md shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:bg-white/10 ${isLarge ? 'h-16 w-16' : 'h-12 w-12'}`}
            dangerouslySetInnerHTML={{ __html: iconSvg }}
          />
        )}
        
        <h3 className={`font-semibold tracking-tight text-white mb-3 ${isLarge ? 'text-2xl md:text-3xl' : 'text-xl'}`}>
          {title}
        </h3>
        
        <p className={`text-white/70 leading-relaxed ${isLarge ? 'text-lg max-w-md' : 'text-base'}`}>
          {description}
        </p>

        {/* Decorative arrow indicating action/interaction */}
        <div className="mt-6 overflow-hidden max-h-0 opacity-0 transition-all duration-300 ease-out group-hover:max-h-12 group-hover:opacity-100">
          <div className="flex items-center text-sm font-medium text-white/90">
            Explorar
            <svg className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
