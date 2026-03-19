'use client';

import { useMemo, useState } from 'react';
import { logger } from '@autamedica/shared';

interface MediaEducativaProps {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  title: string;
  description: string;
  duration?: string; // Para videos: "2:30"
}

export function MediaEducativa({ type, url, title, description }: MediaEducativaProps) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const normalizedUrl = useMemo(() => encodeURI(url), [url]);
  const isLocalVideo = /\.(mp4|webm|ogg)$/i.test(url);
  const videoMimeType = useMemo(() => {
    if (/\.webm$/i.test(url)) return 'video/webm';
    if (/\.ogg$/i.test(url)) return 'video/ogg';
    return 'video/mp4';
  }, [url]);

  return (
    <div>
      {type === 'video' && isLocalVideo ? (
        <div className="rounded-xl bg-sky-50 p-4 border border-sky-200">
          {hasPlaybackError ? (
            <div className="rounded-lg border border-dashed border-sky-300 bg-white p-5">
              <p className="text-sm font-medium text-sky-950">No se pudo reproducir el video</p>
              <p className="mt-1 text-sm text-sky-800">
                Abre el recurso en una pestaña nueva o descarga el archivo para revisarlo.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
                >
                  Abrir video
                </a>
                <a
                  href={normalizedUrl}
                  download
                  className="inline-flex items-center rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
                >
                  Descargar video
                </a>
              </div>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video
                controls
                muted
                playsInline
                preload="metadata"
                className="w-full aspect-video object-contain"
                onLoadedMetadata={(e) => {
                  const video = e.target as HTMLVideoElement;
                  video.muted = true;
                }}
                onCanPlay={(e) => {
                  const video = e.target as HTMLVideoElement;
                  const autoplayAttempt = video.play();
                  if (autoplayAttempt && typeof autoplayAttempt.catch === 'function') {
                    autoplayAttempt.catch(() => {
                      // Controls stay available; user can start playback manually.
                    });
                  }
                }}
                onError={(e) => {
                  const video = e.target as HTMLVideoElement;
                  logger.error('Error loading anamnesis video', {
                    url: normalizedUrl,
                    code: video.error?.code,
                    message: video.error?.message,
                  });
                  setHasPlaybackError(true);
                }}
              >
                <source src={normalizedUrl} type={videoMimeType} />
                Tu navegador no soporta el elemento de video.
              </video>
            </div>
          )}
          <div className="mt-3">
            <p className="text-sm text-gray-700 font-medium mb-1">🎥 Video educativo</p>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>
      ) : type === 'video' ? (
        <div className="rounded-xl bg-sky-50 p-4 border border-sky-200">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <iframe
              src={normalizedUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-700 font-medium mb-1">🎥 Video educativo</p>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-green-50 p-4 border border-green-200">
          <img src={normalizedUrl} alt={title} className="w-full h-auto rounded-lg" />
          <div className="mt-3">
            <p className="text-sm font-medium text-green-900">{title}</p>
            <p className="text-sm text-green-800 mt-1">{description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
