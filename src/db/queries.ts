import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Exercise, SetSide, Template, TemplateExercise, Workout, WorkoutSet } from './types';
import { createExerciseMatcher } from '@/lib/exercise-matching';

// ---------- Exercices ----------

export async function getExercises(
  db: SQLiteDatabase,
  search?: string,
  muscle?: string
): Promise<Exercise[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (search) {
    conditions.push('name LIKE ?');
    params.push(`%${search}%`);
  }
  if (muscle) {
    conditions.push('muscle = ?');
    params.push(muscle);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.getAllAsync<Exercise>(
    `SELECT * FROM exercises ${where} ORDER BY name`,
    params
  );
}

export async function createExercise(db: SQLiteDatabase, name: string, muscle: string, equipment: string) {
  const result = await db.runAsync(
    'INSERT INTO exercises (name, muscle, equipment, is_custom) VALUES (?, ?, ?, 1)',
    name,
    muscle,
    equipment
  );
  return result.lastInsertRowId;
}

export async function getExerciseById(db: SQLiteDatabase, id: number): Promise<Exercise | null> {
  return db.getFirstAsync<Exercise>('SELECT * FROM exercises WHERE id = ?', id);
}

export async function updateExerciseMuscle(db: SQLiteDatabase, exerciseId: number, muscle: string) {
  await db.runAsync('UPDATE exercises SET muscle = ? WHERE id = ?', muscle, exerciseId);
}

// ---------- Séances ----------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function startWorkout(db: SQLiteDatabase, templateId?: number): Promise<number> {
  let workoutId = 0;
  await db.withTransactionAsync(async () => {
    let name = '';
    let color = '';
    if (templateId) {
      const tpl = await db.getFirstAsync<Template>('SELECT * FROM templates WHERE id = ?', templateId);
      name = tpl?.name ?? '';
      color = tpl?.color ?? '';
      const tExercises = await db.getAllAsync<TemplateExercise>(
        'SELECT * FROM template_exercises WHERE template_id = ? ORDER BY order_index',
        templateId
      );
        const result = await db.runAsync(
          `INSERT INTO workouts (name, date, started_at, completed, template_id, color)
           VALUES (?, ?, ?, 0, ?, ?)`,
          name,
          today(),
          Date.now(),
          templateId,
          color
        );
      workoutId = result.lastInsertRowId;
      for (const [i, te] of tExercises.entries()) {
        for (let s = 0; s < te.target_sets; s++) {
          await db.runAsync(
            `INSERT INTO sets (workout_id, exercise_id, weight, reps, set_order)
             VALUES (?, ?, ?, ?, ?)`,
            workoutId,
            te.exercise_id,
            te.target_weight ?? 0,
            te.target_reps,
            i * 100 + s
          );
        }
      }
    } else {
      const result = await db.runAsync(
        'INSERT INTO workouts (name, date, started_at, completed) VALUES (?, ?, ?, 0)',
        '',
        today(),
        Date.now()
      );
      workoutId = result.lastInsertRowId;
    }
  });
  return workoutId;
}

export async function getActiveWorkout(db: SQLiteDatabase): Promise<Workout | null> {
  return db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE completed = 0 ORDER BY started_at DESC LIMIT 1'
  );
}

/** Crée la colonne duration_min si elle manque (base non migrée). */
async function ensureDurationColumn(db: SQLiteDatabase) {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
  if (!cols.some((c) => c.name === 'duration_min')) {
    await db.execAsync('ALTER TABLE workouts ADD COLUMN duration_min INTEGER');
  }
}

/** Ajoute directement une séance terminée hors musculation (grimpe, vélo, course…). */
export async function logActivityWorkout(
  db: SQLiteDatabase,
  name: string,
  durationMin: number,
  notes = '',
  color = ''
): Promise<number> {
  await ensureDurationColumn(db);
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO workouts (name, date, started_at, ended_at, completed, duration_min, notes, color)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    name,
    today(),
    now - durationMin * 60000,
    now,
    durationMin,
    notes,
    color
  );
  return result.lastInsertRowId;
}

/** Jours d'entraînement sur les N derniers mois, avec nb de séries et couleur (pour la heatmap). */
export async function getWorkoutDays(db: SQLiteDatabase, months = 6) {
  return db.getAllAsync<{ day: string; set_count: number; color: string }>(
    `SELECT w.date AS day,
            SUM(CASE WHEN s.done = 1 THEN 1 ELSE 0 END) AS set_count,
            COALESCE(NULLIF(MAX(w.color), ''), '') AS color
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     WHERE w.completed = 1 AND w.date >= date('now', ?)
     GROUP BY w.date ORDER BY w.date`,
    `-${months} month`
  );
}

export async function getWorkouts(
  db: SQLiteDatabase,
  limit = 100,
  offset = 0
): Promise<(Workout & { total_volume: number; set_count: number })[]> {
  return db.getAllAsync(
    `SELECT w.*,
            COALESCE(SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END), 0) AS total_volume,
            COUNT(s.id) AS set_count
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     GROUP BY w.id ORDER BY w.started_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset
  );
}

export interface WorkoutDetailGroup {
  exercise: Exercise;
  side: SetSide | null;
  sets: WorkoutSet[];
}

export interface WorkoutDetail extends Workout {
  exercises: WorkoutDetailGroup[];
}

export async function getWorkoutDetail(db: SQLiteDatabase, workoutId: number): Promise<WorkoutDetail | null> {
  const workout = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ?', workoutId);
  if (!workout) return null;
  const rows = await db.getAllAsync<
    WorkoutSet & { e_name: string; e_muscle: string; e_equipment: string; e_custom: number }
  >(
    `SELECT s.*, e.name AS e_name, e.muscle AS e_muscle, e.equipment AS e_equipment, e.is_custom AS e_custom
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_id = ? ORDER BY s.set_order, s.id`,
    workoutId
  );
  const byExercise = new Map<string, WorkoutDetailGroup>();
  for (const r of rows) {
    const key = `${r.exercise_id}|${r.side ?? ''}`;
    if (!byExercise.has(key)) {
      byExercise.set(key, {
        exercise: {
          id: r.exercise_id,
          name: r.e_name,
          muscle: r.e_muscle,
          equipment: r.e_equipment,
          is_custom: r.e_custom,
        },
        side: (r.side as SetSide) ?? null,
        sets: [],
      });
    }
    byExercise.get(key)!.sets.push(r);
  }
  return { ...workout, exercises: [...byExercise.values()] };
}

export async function finishWorkout(db: SQLiteDatabase, workoutId: number, notes?: string) {
  await db.runAsync(
    'UPDATE workouts SET completed = 1, ended_at = ?, notes = COALESCE(?, notes) WHERE id = ?',
    Date.now(),
    notes ?? null,
    workoutId
  );
}

export async function updateWorkoutName(db: SQLiteDatabase, workoutId: number, name: string) {
  await db.runAsync('UPDATE workouts SET name = ? WHERE id = ?', name, workoutId);
}

export async function deleteWorkout(db: SQLiteDatabase, workoutId: number) {
  await db.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
}

export async function duplicateWorkout(db: SQLiteDatabase, workoutId: number): Promise<number> {
  let newId = 0;
  await db.withTransactionAsync(async () => {
    const src = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ?', workoutId);
    if (!src) throw new Error('workout not found');
    const result = await db.runAsync(
      'INSERT INTO workouts (name, date, started_at, ended_at, notes, completed, color) VALUES (?, ?, ?, ?, ?, 0, ?)',
      src.name,
      today(),
      Date.now(),
      null as unknown as number,
      '',
      src.color
    );
    newId = result.lastInsertRowId;
    const rows = await db.getAllAsync<
      Pick<WorkoutSet, 'exercise_id' | 'weight' | 'reps' | 'set_order' | 'superset_group' | 'side'>
    >(
      'SELECT exercise_id, weight, reps, set_order, superset_group, side FROM sets WHERE workout_id = ? ORDER BY set_order',
      workoutId
    );
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO sets (workout_id, exercise_id, weight, reps, set_order, superset_group, side)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId,
        r.exercise_id,
        r.weight,
        r.reps,
        r.set_order,
        r.superset_group,
        r.side
      );
    }
  });
  return newId;
}

// ---------- Sets ----------

export async function addSet(
  db: SQLiteDatabase,
  workoutId: number,
  exerciseId: number,
  weight = 0,
  reps = 0,
  side: SetSide | null = null
) {
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(set_order) AS max_order FROM sets WHERE workout_id = ? AND exercise_id = ? AND side IS ?',
    workoutId,
    exerciseId,
    side
  );
  const lastSet = await db.getFirstAsync<{ weight: number; reps: number }>(
    'SELECT weight, reps FROM sets WHERE workout_id = ? AND exercise_id = ? AND side IS ? ORDER BY set_order DESC LIMIT 1',
    workoutId,
    exerciseId,
    side
  );
  const result = await db.runAsync(
    'INSERT INTO sets (workout_id, exercise_id, weight, reps, set_order, side) VALUES (?, ?, ?, ?, ?, ?)',
    workoutId,
    exerciseId,
    lastSet?.weight ?? weight,
    lastSet?.reps ?? reps,
    (row?.max_order ?? -1) + 1,
    side
  );
  return result.lastInsertRowId;
}

export type SetUpdates = Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'rpe' | 'done' | 'superset_group'>>;

export async function updateSet(db: SQLiteDatabase, setId: number, updates: SetUpdates) {
  const fields: string[] = [];
  const params: (number | null)[] = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(value as number | null);
  }
  if (!fields.length) return;
  params.push(setId);
  await db.runAsync(`UPDATE sets SET ${fields.join(', ')} WHERE id = ?`, ...params);
}

export async function deleteSet(db: SQLiteDatabase, setId: number) {
  await db.runAsync('DELETE FROM sets WHERE id = ?', setId);
}

export async function getPreviousSets(db: SQLiteDatabase, exerciseId: number, beforeWorkoutId?: number) {
  const condition = beforeWorkoutId ? 'AND w.id != ?' : '';
  const params: number[] = [exerciseId];
  if (beforeWorkoutId) params.push(beforeWorkoutId);
  return db.getAllAsync<WorkoutSet & { date: string }>(
    `SELECT s.*, w.date FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.completed = 1 ${condition}
     ORDER BY w.started_at DESC LIMIT 20`,
    ...params
  );
}

// ---------- Templates / Routines ----------

export async function getTemplates(db: SQLiteDatabase): Promise<(Template & { exercise_count: number })[]> {
  return db.getAllAsync(
    `SELECT t.*, COUNT(te.id) AS exercise_count
     FROM templates t LEFT JOIN template_exercises te ON te.template_id = t.id
     GROUP BY t.id ORDER BY t.name`
  );
}

export async function getTemplateDetail(db: SQLiteDatabase, templateId: number) {
  const template = await db.getFirstAsync<Template>('SELECT * FROM templates WHERE id = ?', templateId);
  if (!template) return null;
  const rows = await db.getAllAsync<TemplateExercise & { e_name: string; e_muscle: string; e_equipment: string; e_custom: number }>(
    `SELECT te.*, e.name AS e_name, e.muscle AS e_muscle, e.equipment AS e_equipment, e.is_custom AS e_custom
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? ORDER BY te.order_index`,
    templateId
  );
  const exercises = rows.map((r) => ({
    ...r,
    exercise: {
      id: r.exercise_id,
      name: r.e_name,
      muscle: r.e_muscle,
      equipment: r.e_equipment,
      is_custom: r.e_custom,
    } as Exercise,
  }));
  return { ...template, exercises };
}

export async function createTemplate(db: SQLiteDatabase, name: string, color = ''): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO templates (name, notes, color) VALUES (?, ?, ?)',
    name,
    '',
    color
  );
  return result.lastInsertRowId;
}

export async function updateTemplateColor(db: SQLiteDatabase, templateId: number, color: string) {
  await db.runAsync('UPDATE templates SET color = ? WHERE id = ?', color, templateId);
}

export async function renameTemplate(db: SQLiteDatabase, templateId: number, name: string) {
  await db.runAsync('UPDATE templates SET name = ? WHERE id = ?', name, templateId);
}

export async function deleteTemplate(db: SQLiteDatabase, templateId: number) {
  await db.runAsync('DELETE FROM templates WHERE id = ?', templateId);
}

export async function addTemplateExercise(
  db: SQLiteDatabase,
  templateId: number,
  exerciseId: number,
  targetSets = 3,
  targetReps = 10
) {
  const row = await db.getFirstAsync<{ max_idx: number | null }>(
    'SELECT MAX(order_index) AS max_idx FROM template_exercises WHERE template_id = ?',
    templateId
  );
  await db.runAsync(
    'INSERT INTO template_exercises (template_id, exercise_id, target_sets, target_reps, order_index) VALUES (?, ?, ?, ?, ?)',
    templateId,
    exerciseId,
    targetSets,
    targetReps,
    (row?.max_idx ?? -1) + 1
  );
}

export type TemplateExerciseUpdates = Partial<
  Pick<TemplateExercise, 'target_sets' | 'target_reps' | 'target_weight'>
>;

export async function updateTemplateExercise(
  db: SQLiteDatabase,
  templateExerciseId: number,
  updates: TemplateExerciseUpdates
) {
  const fields: string[] = [];
  const params: number[] = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(value as number);
  }
  if (!fields.length) return;
  params.push(templateExerciseId);
  await db.runAsync(`UPDATE template_exercises SET ${fields.join(', ')} WHERE id = ?`, ...params);
}

export async function removeTemplateExercise(db: SQLiteDatabase, templateExerciseId: number) {
  await db.runAsync('DELETE FROM template_exercises WHERE id = ?', templateExerciseId);
}

// ---------- Stats ----------

/** 1RM estimé via formule d'Epley : poids * (1 + reps / 30) */
export function estimate1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export interface ExerciseHistoryEntry {
  date: string;
  started_at: number;
  best_1rm: number;
  volume: number;
  top_weight: number;
  side_details?: {
    left?: { best_1rm: number; volume: number; top_weight: number };
    right?: { best_1rm: number; volume: number; top_weight: number };
  };
}

export async function getExerciseHistory(db: SQLiteDatabase, exerciseId: number) {
  const rows = await db.getAllAsync<{
    date: string;
    started_at: number;
    side: string | null;
    best_1rm: number;
    volume: number;
    top_weight: number;
  }>(
    `SELECT w.date, w.started_at, s.side,
            MAX(CASE WHEN s.reps > 0 THEN s.weight * (1 + s.reps / 30.0) ELSE 0 END) AS best_1rm,
            SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END) AS volume,
            MAX(s.weight) AS top_weight
     FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.completed = 1 AND s.done = 1
     GROUP BY w.id, s.side ORDER BY w.started_at ASC`,
    exerciseId
  );
  const merged = new Map<number, ExerciseHistoryEntry>();
  for (const r of rows) {
    let entry = merged.get(r.started_at);
    if (!entry) {
      entry = {
        date: r.date,
        started_at: r.started_at,
        best_1rm: 0,
        volume: 0,
        top_weight: 0,
      };
      merged.set(r.started_at, entry);
    }
    entry.best_1rm = Math.max(entry.best_1rm, r.best_1rm);
    entry.volume += r.volume;
    entry.top_weight = Math.max(entry.top_weight, r.top_weight);
    if (r.side === 'left' || r.side === 'right') {
      entry.side_details ??= {};
      const detail = { best_1rm: r.best_1rm, volume: r.volume, top_weight: r.top_weight };
      if (r.side === 'left') entry.side_details.left = detail;
      else entry.side_details.right = detail;
    }
  }
  return [...merged.values()];
}

export async function getPersonalRecords(db: SQLiteDatabase, days?: number) {
  const periodFilter = days ? `AND w.date >= date('now', '-${days} days')` : '';
  return db.getAllAsync<{
    exercise_id: number;
    name: string;
    top_weight: number;
    top_weight_left: number | null;
    top_weight_right: number | null;
    best_set_reps: number;
    date: string;
  }>(
    `SELECT s.exercise_id, e.name,
            MAX(s.weight) AS top_weight,
            MAX(CASE WHEN s.side = 'left' THEN s.weight END) AS top_weight_left,
            MAX(CASE WHEN s.side = 'right' THEN s.weight END) AS top_weight_right,
            MAX(s.reps) AS best_set_reps,
            (SELECT w2.date FROM sets s2 JOIN workouts w2 ON w2.id = s2.workout_id
             WHERE s2.exercise_id = s.exercise_id AND w2.completed = 1 AND s2.done = 1
               AND s2.side IS s.side${periodFilter}
             ORDER BY s2.weight DESC LIMIT 1) AS date
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.completed = 1 AND s.done = 1 AND s.weight > 0${periodFilter}
     GROUP BY s.exercise_id ORDER BY top_weight DESC`
  );
}

export async function getWeeklyVolume(db: SQLiteDatabase, weeks = 12) {
  return db.getAllAsync<{ week_start: string; volume: number; set_count: number }>(
    `SELECT strftime('%Y-%m-%d', date(w.date, printf('-%d days', CAST(strftime('%w', w.date) AS INTEGER)))) AS week_start,
            SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END) AS volume,
            SUM(CASE WHEN s.done = 1 THEN 1 ELSE 0 END) AS set_count
     FROM workouts w JOIN sets s ON s.workout_id = w.id
     WHERE w.completed = 1
     GROUP BY week_start ORDER BY week_start DESC LIMIT ?`,
    weeks
  );
}

export async function getCurrentWeekDailyVolume(db: SQLiteDatabase) {
  return db.getAllAsync<{
    day: string;
    volume: number;
    set_count: number;
    workout_count: number;
  }>(
    `SELECT w.date AS day,
            SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END) AS volume,
            SUM(CASE WHEN s.done = 1 THEN 1 ELSE 0 END) AS set_count,
            COUNT(DISTINCT w.id) AS workout_count
     FROM workouts w JOIN sets s ON s.workout_id = w.id
     WHERE w.completed = 1 AND w.date >= date('now', 'weekday 1', '-6 days') AND w.date <= date('now')
     GROUP BY w.date ORDER BY w.date`
  );
}

export async function getMuscleVolume(db: SQLiteDatabase, sinceDays = 30) {
  return db.getAllAsync<{ muscle: string; volume: number; set_count: number }>(
    `SELECT e.muscle,
            SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END) AS volume,
            SUM(CASE WHEN s.done = 1 THEN 1 ELSE 0 END) AS set_count
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.completed = 1 AND w.date >= date('now', ?)
     GROUP BY e.muscle ORDER BY volume DESC`,
    `-${sinceDays} days`
  );
}

export async function getTotalStats(db: SQLiteDatabase) {
  return db.getFirstAsync<{
    total_workouts: number;
    total_sets: number;
    total_volume: number;
    total_duration: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM workouts WHERE completed = 1) AS total_workouts,
       (SELECT COUNT(*) FROM sets s JOIN workouts w ON w.id = s.workout_id WHERE w.completed = 1 AND s.done = 1) AS total_sets,
       (SELECT COALESCE(SUM(s.weight * s.reps), 0) FROM sets s JOIN workouts w ON w.id = s.workout_id WHERE w.completed = 1 AND s.done = 1) AS total_volume,
       (SELECT COALESCE(SUM(w.ended_at - w.started_at), 0) FROM workouts w WHERE w.completed = 1 AND w.ended_at IS NOT NULL AND w.started_at IS NOT NULL) AS total_duration`
  );
}

// ---------- Réglages ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

/** Supprime toutes les données : séances, séries, routines et exercices personnalisés. */
export async function deleteAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
DELETE FROM sets;
DELETE FROM workouts;
DELETE FROM template_exercises;
DELETE FROM templates;
DELETE FROM exercises WHERE is_custom = 1;
`);
  });
}

// ---------- Import Strong ----------

export interface ImportStats {
  imported: number;
  skipped: number;
  setsImported: number;
  exercisesCreated: number;
}

/**
 * Noms d'exercices du CSV sans correspondance dans la base
 * (ils seront créés comme exercices personnalisés sauf association manuelle).
 */
export async function getUnmatchedImportExercises(
  db: SQLiteDatabase,
  workouts: { sets: { exerciseName: string }[] }[]
): Promise<string[]> {
  const matcher = createExerciseMatcher(
    await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM exercises')
  );
  const names = new Set<string>();
  for (const w of workouts) {
    for (const s of w.sets) {
      if (!matcher.find(s.exerciseName)) names.add(s.exerciseName);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Importe des séances parsées depuis un export CSV de l'app Strong (dédoublonne par date de début). */
export async function importStrongWorkouts(
  db: SQLiteDatabase,
  workouts: {
    startedAt: number;
    name: string;
    durationSec: number | null;
    notes: string;
    sets: {
      exerciseName: string;
      order: number;
      weight: number;
      reps: number;
      rpe: number | null;
      side?: 'left' | 'right' | null;
    }[];
  }[],
  /** Association manuelle nom CSV -> id d'exercice existant. */
  exerciseOverrides: Record<string, number> = {}
): Promise<ImportStats> {
  const stats: ImportStats = { imported: 0, skipped: 0, setsImported: 0, exercisesCreated: 0 };

  const existing = new Set(
    (
      await db.getAllAsync<{ started_at: number }>(
        'SELECT started_at FROM workouts WHERE started_at IS NOT NULL'
      )
    ).map((r) => r.started_at)
  );

  // Matching des noms d'exercices du CSV avec les exercices existants
  const matcher = createExerciseMatcher(
    await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM exercises')
  );

  // withExclusiveTransactionAsync n'est pas supporté sur web (SQLite WASM)
  const execImport = async (txn: Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync'>) => {
    for (const w of workouts) {
      if (existing.has(w.startedAt)) {
        stats.skipped++;
        continue;
      }
      const endedAt = w.durationSec ? w.startedAt + w.durationSec * 1000 : null;
      const result = await txn.runAsync(
        `INSERT INTO workouts (name, date, started_at, ended_at, notes, completed)
         VALUES (?, ?, ?, ?, ?, 1)`,
        w.name,
        new Date(w.startedAt).toISOString().slice(0, 10),
        w.startedAt,
        endedAt,
        w.notes
      );
      const workoutId = result.lastInsertRowId;

      for (const s of w.sets) {
        let ex: { id: number; name: string } | null;
        const overrideId = exerciseOverrides[s.exerciseName];
        if (overrideId) {
          ex = { id: overrideId, name: s.exerciseName };
        } else {
          ex = matcher.find(s.exerciseName);
          if (!ex) {
            const result = await txn.runAsync(
              'INSERT INTO exercises (name, muscle, equipment, is_custom) VALUES (?, ?, ?, 1)',
              s.exerciseName,
              'fullbody',
              'other'
            );
            ex = { id: result.lastInsertRowId, name: s.exerciseName };
            matcher.add(ex);
            stats.exercisesCreated++;
          }
        }
        await txn.runAsync(
          `INSERT INTO sets (workout_id, exercise_id, weight, reps, rpe, done, set_order, side)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          workoutId,
          ex.id,
          s.weight,
          s.reps,
          s.rpe,
          s.order,
          s.side ?? null
        );
        stats.setsImported++;
      }
      existing.add(w.startedAt);
      stats.imported++;
    }
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => execImport(db));
  } else {
    await db.withExclusiveTransactionAsync(execImport);
  }

  return stats;
}
