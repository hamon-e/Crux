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

export interface WorkoutSet {
  id: number;
  workout_id: number;
  exercise_id: number;
  weight: number;
  reps: number;
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
  order_index: number;
  exercise_name?: string;
}

export interface ActivityType {
  id: number;
  name: string;
  color: string;
}
