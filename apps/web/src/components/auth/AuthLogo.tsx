interface AuthLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { dimension: 64, containerClass: 'w-16 h-16', borderClass: 'border-2' },
  md: { dimension: 96, containerClass: 'w-24 h-24', borderClass: 'border-[3px]' },
  lg: { dimension: 128, containerClass: 'w-32 h-32', borderClass: 'border-4' },
};

export function AuthLogo({ size = 'md' }: AuthLogoProps) {
  const { dimension, containerClass } = sizes[size];

  return (
    <div className={`
      relative
      ${containerClass}
      mx-auto
      mb-8
      rounded-[2rem]
      bg-[#09090b]
      p-0.5
      ring-1 ring-white/10
      shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)]
      flex
      items-center
      justify-center
      overflow-hidden
      group
    `}>
      <div className="absolute inset-0 bg-gradient-to-tr from-[var(--au-accent-glow)]/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
      <img
        src="/logo_bioceramic.png"
        alt="AutaMedica"
        width={dimension}
        height={dimension}
        className="relative z-10 object-contain rounded-2xl transition-transform duration-700 group-hover:scale-105"
      />
    </div>
  );
}
