import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import React, { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

if (typeof window !== 'undefined') {
  ScrollTrigger.config({ ignoreMobileResize: true });
}

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
  scrub?: boolean;
}

export const TextReveal: React.FC<TextRevealProps> = ({ text, className = '', delay = 0, scrub = false }) => {
  const containerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!containerRef.current) return;

      const words = containerRef.current.querySelectorAll('.word');
      
      gsap.fromTo(
        words,
        {
          y: '100%',
          opacity: 0,
          rotateZ: 5,
        },
        {
          y: '0%',
          opacity: 1,
          rotateZ: 0,
          duration: 1.2,
          ease: 'power4.out',
          stagger: 0.05,
          delay: delay,
          scrollTrigger: scrub ? {
            trigger: containerRef.current,
            start: 'top 85%',
            end: 'bottom 50%',
            scrub: 1,
          } : {
            trigger: containerRef.current,
            start: 'top 85%',
            toggleActions: 'play none none none',
          }
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, [delay, scrub]);

  // Split text by lines first, then by words for performance, while preserving newlines
  const lines = text.split('\n');

  return (
    <h1 ref={containerRef} className={`overflow-hidden flex flex-wrap gap-x-[0.3em] gap-y-[0em] ${className}`}>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {line.split(' ').map((word, wordIndex) => (
            word.trim() !== '' && (
              <span key={`${lineIndex}-${wordIndex}`} className="word inline-block origin-bottom-left will-change-transform pb-1">
                {word}
              </span>
            )
          ))}
          {lineIndex < lines.length - 1 && <div className="basis-full h-0" />}
        </React.Fragment>
      ))}
    </h1>
  );
};
