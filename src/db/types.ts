export const MUSCLES = [
  'chest',
  'back',
  'traps',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'fingers',
  'core',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'fullbody',
  'cardio',
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Pectoraux',
  back: 'Dos',
  traps: 'Trapèzes',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  fingers: 'Doigts',
  core: 'Abdos',
  quads: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  calves: 'Mollets',
  fullbody: 'Full body',
  cardio: 'Cardio',
};

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'other',
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

export interface Exercise {
  id: number;
  name: string;
  muscle: string;
  equipment: string;
  is_custom: number;
  /** Vidéo démo Google Drive (compétences de la spreadsheet). */
  video_url?: string;
  /** Catégorie / difficulté (compétences de la spreadsheet uniquement). */
  category?: string;
  difficulty?: string;
}

export interface Workout {
  id: number;
  name: string;
  date: string;
  started_at: number | null;
  ended_at: number | null;
  notes: string;
  template_id: number | null;
  completed: number;
  duration_min: number | null;
  color: string;
}

export type SetSide = 'left' | 'right';

/** Mode de comptage d'un exercice : répétitions ou temps (secondes). */
export type SetType = 'reps' | 'time';

export interface WorkoutSet {
  id: number;
  workout_id: number;
  exercise_id: number;
  weight: number;
  reps: number;
  /** Exercice chronométré : durée cible/réalisée en secondes (null = basé reps). */
  duration: number | null;
  rpe: number | null;
  done: number;
  set_order: number;
  superset_group: number | null;
  side: SetSide | null;
  exercise_name?: string;
  muscle?: string;
}

export interface Template {
  id: number;
  name: string;
  notes: string;
  color: string;
}

export interface TemplateExercise {
  id: number;
  template_id: number;
  exercise_id: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  /** Comptage par répétitions ou par temps. */
  set_type: SetType;
  /** Durée cible uniforme (secondes) pour les exercices chronométrés. */
  target_seconds: number;
  order_index: number;
  /** Exercice unilatéral : côté visé par cette entrée (null = bilatéral). */
  side: SetSide | null;
  exercise_name?: string;
}

export interface TemplateSet {
  id: number;
  template_exercise_id: number;
  set_index: number;
  target_reps: number;
  target_weight: number;
  /** Durée cible (secondes) pour les exercices chronométrés. */
  target_seconds: number;
}

export interface SeanceType {
  id: number;
  name: string;
  color: string;
}
