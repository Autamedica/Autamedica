import type { BodyAspect, BodyLaterality } from '@/types/anamnesis';

export interface AnatomicalBodyRegion {
  id: string;
  label: string;
  path: string;
  defaultLaterality: BodyLaterality;
  defaultAspect: BodyAspect;
  clinicalBucket:
    | 'head'
    | 'neck'
    | 'chest'
    | 'abdomen'
    | 'pelvis'
    | 'upper_limb'
    | 'lower_limb';
}

export const anatomicalBodyRegions: AnatomicalBodyRegion[] = [
  {
    id: 'head',
    label: 'Cabeza',
    path: 'M 100 20 L 140 20 L 140 70 L 100 70 Z',
    defaultLaterality: 'midline',
    defaultAspect: 'anterior',
    clinicalBucket: 'head',
  },
  {
    id: 'neck',
    label: 'Cuello',
    path: 'M 110 70 L 130 70 L 130 90 L 110 90 Z',
    defaultLaterality: 'midline',
    defaultAspect: 'anterior',
    clinicalBucket: 'neck',
  },
  {
    id: 'chest',
    label: 'Torax',
    path: 'M 80 90 L 160 90 L 155 160 L 85 160 Z',
    defaultLaterality: 'midline',
    defaultAspect: 'anterior',
    clinicalBucket: 'chest',
  },
  {
    id: 'abdomen',
    label: 'Abdomen',
    path: 'M 85 160 L 155 160 L 160 230 L 80 230 Z',
    defaultLaterality: 'midline',
    defaultAspect: 'anterior',
    clinicalBucket: 'abdomen',
  },
  {
    id: 'pelvis',
    label: 'Pelvis',
    path: 'M 80 230 L 160 230 L 150 270 L 90 270 Z',
    defaultLaterality: 'midline',
    defaultAspect: 'anterior',
    clinicalBucket: 'pelvis',
  },
  {
    id: 'left_shoulder',
    label: 'Hombro izquierdo',
    path: 'M 50 90 L 80 90 L 85 130 L 45 130 Z',
    defaultLaterality: 'left',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'right_shoulder',
    label: 'Hombro derecho',
    path: 'M 160 90 L 190 90 L 195 130 L 155 130 Z',
    defaultLaterality: 'right',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'left_arm',
    label: 'Brazo izquierdo',
    path: 'M 45 130 L 85 130 L 75 200 L 35 200 Z',
    defaultLaterality: 'left',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'right_arm',
    label: 'Brazo derecho',
    path: 'M 155 130 L 195 130 L 205 200 L 165 200 Z',
    defaultLaterality: 'right',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'left_forearm',
    label: 'Antebrazo izquierdo',
    path: 'M 35 200 L 75 200 L 65 270 L 25 270 Z',
    defaultLaterality: 'left',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'right_forearm',
    label: 'Antebrazo derecho',
    path: 'M 165 200 L 205 200 L 215 270 L 175 270 Z',
    defaultLaterality: 'right',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'left_hand',
    label: 'Mano izquierda',
    path: 'M 25 270 L 65 270 L 55 310 L 15 310 Z',
    defaultLaterality: 'left',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'right_hand',
    label: 'Mano derecha',
    path: 'M 175 270 L 215 270 L 225 310 L 185 310 Z',
    defaultLaterality: 'right',
    defaultAspect: 'anterior',
    clinicalBucket: 'upper_limb',
  },
  {
    id: 'left_thigh',
    label: 'Muslo izquierdo',
    path: 'M 90 270 L 118 270 L 115 370 L 85 370 Z',
    defaultLaterality: 'left',
    defaultAspect: 'anterior',
    clinicalBucket: 'lower_limb',
  },
  {
    id: 'right_thigh',
    label: 'Muslo derecho',
    path: 'M 122 270 L 150 270 L 155 370 L 125 370 Z',
    defaultLaterality: 'right',
    defaultAspect: 'anterior',
    clinicalBucket: 'lower_limb',
  },
  {
    id: 'left_calf',
    label: 'Pantorrilla izquierda',
    path: 'M 85 370 L 115 370 L 110 460 L 80 460 Z',
    defaultLaterality: 'left',
    defaultAspect: 'posterior',
    clinicalBucket: 'lower_limb',
  },
  {
    id: 'right_calf',
    label: 'Pantorrilla derecha',
    path: 'M 125 370 L 155 370 L 160 460 L 130 460 Z',
    defaultLaterality: 'right',
    defaultAspect: 'posterior',
    clinicalBucket: 'lower_limb',
  },
  {
    id: 'left_foot',
    label: 'Pie izquierdo',
    path: 'M 80 460 L 110 460 L 110 490 L 60 490 Z',
    defaultLaterality: 'left',
    defaultAspect: 'anterior',
    clinicalBucket: 'lower_limb',
  },
  {
    id: 'right_foot',
    label: 'Pie derecho',
    path: 'M 130 460 L 160 460 L 180 490 L 130 490 Z',
    defaultLaterality: 'right',
    defaultAspect: 'anterior',
    clinicalBucket: 'lower_limb',
  },
];

export function getBodyRegionById(partId: string): AnatomicalBodyRegion | undefined {
  return anatomicalBodyRegions.find((region) => region.id === partId);
}

export function getBodyMapHeatColor(intensity: number): string {
  if (intensity <= 0) return '#e7e5e4';
  if (intensity <= 2) return '#fde68a';
  if (intensity <= 4) return '#fbbf24';
  if (intensity <= 6) return '#fb923c';
  if (intensity <= 8) return '#f87171';
  return '#b91c1c';
}
