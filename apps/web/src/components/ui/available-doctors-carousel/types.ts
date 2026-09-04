export interface Doctor {
  id: string;
  name: string;
  photoUrl?: string;
  specialty: string;
  city?: string;
  matricula?: string;
  price?: number;
  rating?: number;
  languages?: string[];
  experienceYears?: number;
  hospital?: string;
  university?: string;
  availability?: 'today' | 'tomorrow' | 'full';
  verified?: boolean;
}
