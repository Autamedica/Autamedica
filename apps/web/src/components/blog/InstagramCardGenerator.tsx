import { useCallback, useEffect, useRef, useState } from 'react';

type CardFormat = 'stories' | 'feed';

interface InstagramCardGeneratorProps {
  title: string;
  description: string;
  category: string;
  author: string;
  url: string;
  onClose: () => void;
}

const FORMATS: Record<CardFormat, { width: number; height: number; label: string }> = {
  stories: { width: 1080, height: 1920, label: 'Stories (9:16)' },
  feed: { width: 1080, height: 1080, label: 'Feed (1:1)' },
};

// AutaMedica brand palette (from globals.css design tokens)
const BRAND_ACCENT = '#0EA5E9';    // --au-accent (sky blue)
const BRAND_ACCENT_LIGHT = '#E0F2FE'; // light sky for badges/backgrounds
const TEXT_PRIMARY = '#050505';     // --au-text-primary
const TEXT_SECONDARY = '#334155';   // --au-text-secondary
const TEXT_TERTIARY = '#64748b';    // --au-text-tertiary

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && current !== lines[maxLines - 1]) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '…');
  }
  return lines;
}

function generateQRMatrix(data: string): boolean[][] {
  // Minimal QR-like pattern generator. This creates a visually recognizable
  // grid pattern rather than a spec-compliant QR code, since we avoid external deps.
  // The actual URL is printed below the code as fallback.
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (row: number, col: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[row + r][col + c] = isOuter || isInner;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Data area — deterministic hash of input
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  for (let r = 9; r < size - 8; r++) {
    for (let c = 9; c < size - 8; c++) {
      hash = ((hash << 5) - hash + r * 31 + c * 17) | 0;
      matrix[r][c] = (hash & 1) === 1;
    }
  }

  return matrix;
}

function drawCard(
  canvas: HTMLCanvasElement,
  format: CardFormat,
  props: Omit<InstagramCardGeneratorProps, 'onClose'>,
) {
  const { width, height } = FORMATS[format];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pad = 80;
  const contentWidth = width - pad * 2;
  const isStories = format === 'stories';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Top accent gradient bar
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, BRAND_ACCENT);
  grad.addColorStop(1, BRAND_ACCENT_LIGHT);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 6);

  // Logo text
  const logoY = isStories ? 120 : 90;
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = BRAND_ACCENT;
  ctx.textAlign = 'left';
  ctx.fillText('AutaMedica', pad, logoY);

  // Thin separator
  const sepY = logoY + 30;
  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, sepY);
  ctx.lineTo(width - pad, sepY);
  ctx.stroke();

  // Category badge
  const badgeY = sepY + 50;
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = BRAND_ACCENT;
  const catMetrics = ctx.measureText(props.category.toUpperCase());
  const badgePadX = 16;
  const badgePadY = 8;
  const badgeH = 36;
  ctx.fillStyle = BRAND_ACCENT_LIGHT;
  ctx.beginPath();
  ctx.roundRect(pad, badgeY - badgeH + badgePadY, catMetrics.width + badgePadX * 2, badgeH + badgePadY, 6);
  ctx.fill();
  ctx.fillStyle = BRAND_ACCENT;
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(props.category.toUpperCase(), pad + badgePadX, badgeY);

  // Title
  const titleY = badgeY + 60;
  const titleSize = isStories ? 64 : 54;
  ctx.font = `bold ${titleSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.textAlign = 'left';
  const titleLines = wrapText(ctx, props.title, contentWidth, isStories ? 6 : 4);
  let y = titleY;
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += titleSize * 1.25;
  }

  // Description
  const descY = y + 30;
  const descSize = isStories ? 32 : 28;
  ctx.font = `${descSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = TEXT_SECONDARY;
  const descLines = wrapText(ctx, props.description, contentWidth, isStories ? 4 : 3);
  y = descY;
  for (const line of descLines) {
    ctx.fillText(line, pad, y);
    y += descSize * 1.5;
  }

  // QR code
  const qrSize = isStories ? 200 : 150;
  const qrY = isStories ? height - 520 : height - 340;
  const qrX = (width - qrSize) / 2;

  const matrix = generateQRMatrix(props.url);
  const cellSize = qrSize / matrix.length;
  ctx.fillStyle = TEXT_PRIMARY;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(qrX + c * cellSize, qrY + r * cellSize, cellSize, cellSize);
      }
    }
  }

  // URL below QR
  const urlY = qrY + qrSize + 36;
  ctx.font = '24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = TEXT_TERTIARY;
  ctx.textAlign = 'center';
  const shortUrl = props.url.replace(/^https?:\/\//, '');
  ctx.fillText(shortUrl, width / 2, urlY);

  // Author
  const authorY = urlY + 50;
  ctx.font = '26px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.fillText(props.author, width / 2, authorY);

  // Bottom branding
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = BRAND_ACCENT;
  ctx.textAlign = 'center';
  ctx.fillText('autamedica.com', width / 2, height - 60);

  // Bottom accent line
  ctx.fillStyle = BRAND_ACCENT;
  ctx.fillRect(0, height - 6, width, 6);
}

export default function InstagramCardGenerator(props: InstagramCardGeneratorProps) {
  const [format, setFormat] = useState<CardFormat>('stories');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    drawCard(canvasRef.current, format, props);
  }, [format, props]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [props.onClose]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `autamedica-${format}-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  const { width, height } = FORMATS[format];
  const previewScale = format === 'stories' ? 0.22 : 0.35;

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          onClick={props.onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#737373',
            lineHeight: 1,
          }}
        >
          &times;
        </button>

        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600, color: TEXT_PRIMARY }}>
          Generar imagen para Instagram
        </h3>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {(Object.entries(FORMATS) as [CardFormat, (typeof FORMATS)[CardFormat]][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setFormat(key)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: `2px solid ${format === key ? BRAND_ACCENT : '#e5e5e5'}`,
                borderRadius: '8px',
                background: format === key ? BRAND_ACCENT_LIGHT : '#fff',
                color: format === key ? BRAND_ACCENT : TEXT_SECONDARY,
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {val.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '1rem',
            background: '#f5f5f5',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: `${width * previewScale}px`,
              height: `${height * previewScale}px`,
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          />
        </div>

        <button
          onClick={handleDownload}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: BRAND_ACCENT,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Descargar imagen
        </button>
      </div>
    </div>
  );
}
