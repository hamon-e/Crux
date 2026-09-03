import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

import type {
  Exercise,
  SeanceType,
  SetSide,
  Template,
  TemplateExercise,
  TemplateSet,
  Workout,
  WorkoutSet,
} from "./types";
import { createExerciseMatcher } from "@/lib/exercise-matching";
import { ROUTINE_COLORS } from "@/constants/routine-colors";
import { normalizeSkillName, SKILL_STEPS } from "./skill-steps";

// ---------- Exercices ----------

export async function getExercises(
  db: SQLiteDatabase,
  search?: string,
  muscle?: string,
  tag?: string,
  includeProgressions = false,
): Promise<Exercise[]> {
  const conditions: string[] = [];
  if (!includeProgressions) {
    conditions.push("COALESCE(category, '') = ''");
  }
  const params: (string | number)[] = [];
  if (search) {
    conditions.push("name LIKE ?");
    params.push(`%${search}%`);
  }
  if (muscle) {
    conditions.push("muscle = ?");
    params.push(muscle);
  }
  if (tag) {
    conditions.push("(',' || COALESCE(tags, '') || ',') LIKE ?");
    params.push(`%,${tag},%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.getAllAsync<Exercise>(`SELECT * FROM exercises ${where} ORDER BY name`, params);
}
export async function createExercise(
  db: SQLiteDatabase,
  name: string,
  muscle: string,
  equipment: string,
) {
  const result = await db.runAsync(
    "INSERT INTO exercises (name, muscle, equipment, is_custom) VALUES (?, ?, ?, 1)",
    name,
    muscle,
    equipment,
  );
  return result.lastInsertRowId;
}

export async function getExerciseById(db: SQLiteDatabase, id: number): Promise<Exercise | null> {
  return db.getFirstAsync<Exercise>("SELECT * FROM exercises WHERE id = ?", id);
}

/** Exercices livrés avec l'application, proposés pour remplacer un exercice personnalisé. */
export async function getDefaultExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>(
    `SELECT * FROM exercises
     WHERE is_custom = 0 AND COALESCE(category, '') = ''
     ORDER BY name`,
  );
}

/** Exercices standard pouvant recevoir l'historique d'un exercice du catalogue. */
export async function getExerciseMatchTargets(
  db: SQLiteDatabase,
  sourceExerciseId: number,
): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>(
    `SELECT * FROM exercises
     WHERE id != ? AND COALESCE(category, '') = ''
     ORDER BY name`,
    sourceExerciseId,
  );
}

/**
 * Remplace définitivement un exercice personnalisé par un exercice du catalogue.
 * Les séries et les références dans les routines sont conservées sous l'exercice cible.
 */
export async function matchCustomExerciseToDefault(
  db: SQLiteDatabase,
  customExerciseId: number,
  defaultExerciseId: number,
) {
  if (customExerciseId === defaultExerciseId) {
    throw new Error('Les deux exercices doivent être différents.');
  }

  await db.withTransactionAsync(async () => {
    const source = await getExerciseById(db, customExerciseId);
    const target = await getExerciseById(db, defaultExerciseId);
    if (!source?.is_custom || !target || target.is_custom || target.category) {
      throw new Error('Association d’exercices invalide.');
    }

    await db.runAsync('UPDATE sets SET exercise_id = ? WHERE exercise_id = ?', defaultExerciseId, customExerciseId);
    await db.runAsync(
      'UPDATE template_exercises SET exercise_id = ? WHERE exercise_id = ?',
      defaultExerciseId,
      customExerciseId,
    );
    await db.runAsync('DELETE FROM exercises WHERE id = ?', customExerciseId);
  });
}

/**
 * Réassocie l'historique et les routines d'un exercice du catalogue à un
 * autre exercice de la base. À l'inverse de l'association custom → catalogue,
 * l'exercice livré avec l'app reste disponible dans le catalogue.
 */
export async function matchDefaultExerciseToExercise(
  db: SQLiteDatabase,
  defaultExerciseId: number,
  targetExerciseId: number,
) {
  if (defaultExerciseId === targetExerciseId) {
    throw new Error('Les deux exercices doivent être différents.');
  }

  await db.withTransactionAsync(async () => {
    const source = await getExerciseById(db, defaultExerciseId);
    const target = await getExerciseById(db, targetExerciseId);
    if (!source || source.is_custom || source.category || !target || target.category) {
      throw new Error('Association d’exercices invalide.');
    }

    // Toutes les statistiques sont calculées depuis `sets` : réaffecter les
    // séries transfère donc aussi l'historique, les records et les volumes.
    await db.runAsync('UPDATE sets SET exercise_id = ? WHERE exercise_id = ?', targetExerciseId, defaultExerciseId);
    await db.runAsync(
      'UPDATE template_exercises SET exercise_id = ? WHERE exercise_id = ?',
      targetExerciseId,
      defaultExerciseId,
    );
  });
}

export interface ProgressionReference {
  id: number;
  name: string;
}

/** Renvoie la progression d'une étape, ou elle-même lorsqu'il s'agit déjà d'une progression. */
export async function getExerciseProgression(
  db: SQLiteDatabase,
  exerciseId: number,
): Promise<ProgressionReference | null> {
  const exercise = await getExerciseById(db, exerciseId);
  if (!exercise) return null;

  // Les progressions portent une catégorie dédiée.
  if (exercise.category) return { id: exercise.id, name: exercise.name };

  const progressionKey = SKILL_STEPS.find((entry) =>
    entry.steps.some((step) => normalizeSkillName(step.name) === normalizeSkillName(exercise.name)),
  )?.key;
  if (!progressionKey) return null;

  const progression = (await getProgressions(db)).find(
    (item) => normalizeSkillName(item.name) === progressionKey,
  );
  return progression ? { id: progression.id, name: progression.name } : null;
}

export async function updateExerciseMuscle(db: SQLiteDatabase, exerciseId: number, muscle: string) {
  await db.runAsync("UPDATE exercises SET muscle = ? WHERE id = ?", muscle, exerciseId);
}

export async function updateExerciseImage(
  db: SQLiteDatabase,
  exerciseId: number,
  imageUri: string,
) {
  await db.runAsync("UPDATE exercises SET image_uri = ? WHERE id = ?", imageUri, exerciseId);
}

// ---------- Progressions ----------

/** Une progression affichée dans l'arbre de compétences. */
export interface Progression {
  id: number;
  name: string;
  muscle: string;
  category: string;
  difficulty: string;
  /** Nombre d'occurrences distinctes dans l'historique avec au moins une série validée.
   * Les progressions déduites de leur dernière étape ont au minimum la valeur 1. */
  sessions: number;
  /** Image de couverture (première étape ayant une image). */
  cover_image?: string | null;
  /** Part des étapes de la progression qui ont été validées, entre 0 et 1. */
  validationProgress: number;
}

/**
 * Déduit les progressions acquises depuis les exercices réalisés. Seule la
 * dernière étape valide sa progression parente. Un exercice portant exactement
 * le nom d'une progression continue de valider directement cette progression.
 */
function getProgressionsCompletedFromHistory(
  progressions: Pick<Progression, "id" | "name">[],
  historicalExerciseNames: Iterable<string>,
): Set<number> {
  const progressionByKey = new Map(
    progressions.map((progression) => [normalizeSkillName(progression.name), progression]),
  );
  const parentsByLastStepKey = new Map<string, Set<string>>();
  for (const entry of SKILL_STEPS) {
    const lastStep = entry.steps.at(-1);
    if (!lastStep) continue;
    const stepKey = normalizeSkillName(lastStep.name);
    const parents = parentsByLastStepKey.get(stepKey) ?? new Set<string>();
    parents.add(entry.key);
    parentsByLastStepKey.set(stepKey, parents);
  }

  const completed = new Set<number>();
  for (const name of historicalExerciseNames) {
    const key = normalizeSkillName(name);
    const directProgression = progressionByKey.get(key);
    if (directProgression) completed.add(directProgression.id);
    for (const parentKey of parentsByLastStepKey.get(key) ?? []) {
      const parent = progressionByKey.get(parentKey);
      if (parent) completed.add(parent.id);
    }
  }

  return completed;
}

/** Marque les étapes de toute progression acquise par une séance terminée.
 * Une progression est acquise par son propre exercice ou par sa dernière étape. */
async function validateProgressionsFromExerciseNames(
  db: SQLiteDatabase,
  historicalExerciseNames: Iterable<string>,
) {
  const progressions = await db.getAllAsync<ProgressionReference>(
    "SELECT id, name FROM exercises WHERE COALESCE(category, '') != ''",
  );
  const progressionByKey = new Map(
    progressions.map((progression) => [normalizeSkillName(progression.name), progression.id]),
  );
  const parentsByLastStepKey = new Map<string, Set<number>>();
  for (const entry of SKILL_STEPS) {
    const lastStep = entry.steps.at(-1);
    const progressionId = progressionByKey.get(entry.key);
    if (!lastStep || !progressionId) continue;
    const key = normalizeSkillName(lastStep.name);
    const parents = parentsByLastStepKey.get(key) ?? new Set<number>();
    parents.add(progressionId);
    parentsByLastStepKey.set(key, parents);
  }

  const completedIds = new Set<number>();
  for (const name of historicalExerciseNames) {
    const key = normalizeSkillName(name);
    const directId = progressionByKey.get(key);
    if (directId) completedIds.add(directId);
    for (const parentId of parentsByLastStepKey.get(key) ?? []) completedIds.add(parentId);
  }
  for (const progressionId of completedIds) {
    await db.runAsync(
      `INSERT OR IGNORE INTO exercise_step_progress (exercise_id, step_order, validated_at)
       SELECT exercise_id, step_order, ? FROM exercise_steps WHERE exercise_id = ?`,
      Date.now(),
      progressionId,
    );
  }
}

export async function getProgressions(db: SQLiteDatabase): Promise<Progression[]> {
  const progressions = await db.getAllAsync<Progression>(
    `SELECT e.id, e.name, e.muscle,
            COALESCE(e.category, '') AS category,
            COALESCE(e.difficulty, '') AS difficulty,
            (SELECT COUNT(DISTINCT s.workout_id) FROM sets s JOIN workouts w ON w.id = s.workout_id
             WHERE s.exercise_id = e.id AND w.completed = 1 AND s.done = 1) AS sessions,
            (SELECT es.image FROM exercise_steps es WHERE es.exercise_id = e.id
             AND COALESCE(es.image, '') != '' ORDER BY es.step_order LIMIT 1) AS cover_image,
            CASE
              WHEN (SELECT COUNT(*) FROM exercise_steps es WHERE es.exercise_id = e.id) > 0
              THEN CAST((SELECT COUNT(*) FROM exercise_step_progress esp
                         WHERE esp.exercise_id = e.id) AS REAL)
                   / (SELECT COUNT(*) FROM exercise_steps es WHERE es.exercise_id = e.id)
              ELSE CASE
                WHEN (SELECT COUNT(DISTINCT s.workout_id)
                      FROM sets s JOIN workouts w ON w.id = s.workout_id
                      WHERE s.exercise_id = e.id AND w.completed = 1 AND s.done = 1) > 0
                THEN 1.0
                ELSE 0.0
              END
            END AS validationProgress
     FROM exercises e
     WHERE COALESCE(e.category, '') != ''
     ORDER BY e.name`,
  );
  const historicalExercises = await db.getAllAsync<{ name: string }>(
    `SELECT DISTINCT e.name
     FROM exercises e
     JOIN sets s ON s.exercise_id = e.id
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.completed = 1 AND s.done = 1`,
  );
  const completedProgressionIds = getProgressionsCompletedFromHistory(
    progressions,
    historicalExercises.map((exercise) => exercise.name),
  );

  return progressions.map((progression) =>
    completedProgressionIds.has(progression.id) && progression.sessions === 0
      ? { ...progression, sessions: 1 }
      : progression,
  );
}

/** Valide manuellement une progression en ajoutant une occurrence à son historique. */
export async function validateProgressionManually(
  db: SQLiteDatabase,
  progressionId: number,
): Promise<number> {
  const [workoutId] = await validateProgressionsManually(db, [progressionId]);
  return workoutId;
}

/** Valide plusieurs progressions manuellement dans une seule transaction. */
export async function validateProgressionsManually(
  db: SQLiteDatabase,
  progressionIds: number[],
): Promise<number[]> {
  const day = today();
  const endedAt = Date.now();
  const workoutIds: number[] = [];
  await db.withTransactionAsync(async () => {
    for (const progressionId of [...new Set(progressionIds)]) {
      const result = await db.runAsync(
        "INSERT INTO workouts (name, date, started_at, ended_at, completed) VALUES (?, ?, ?, ?, 1)",
        "Validation manuelle",
        day,
        endedAt,
        endedAt,
      );
      const workoutId = result.lastInsertRowId;
      workoutIds.push(workoutId);
      await db.runAsync(
        "INSERT INTO sets (workout_id, exercise_id, weight, reps, done, set_order) VALUES (?, ?, 0, 0, 1, 0)",
        workoutId,
        progressionId,
      );
      // Une validation de progression implique explicitement toutes ses étapes.
      await validateProgressionsFromExerciseNames(db, [
        (await getExerciseById(db, progressionId))?.name ?? "",
      ]);
    }
  });
  return workoutIds;
}

export interface ExerciseStep {
  id: number;
  exercise_id: number;
  step_order: number;
  name: string;
  reps: string;
  instructions: string;
  image: string;
  video: string;
  validated: number;
}

export async function getExerciseSteps(
  db: SQLiteDatabase,
  exerciseId: number,
): Promise<ExerciseStep[]> {
  return db.getAllAsync<ExerciseStep>(
    `SELECT es.*, CASE WHEN esp.exercise_id IS NULL THEN 0 ELSE 1 END AS validated
     FROM exercise_steps es
     LEFT JOIN exercise_step_progress esp
       ON esp.exercise_id = es.exercise_id AND esp.step_order = es.step_order
     WHERE es.exercise_id = ? ORDER BY es.step_order`,
    exerciseId,
  );
}

/**
 * Bascule la validation d’une étape.
 *
 * Une étape validée implique que toutes les étapes précédentes le sont aussi.
 * La cascade est faite dans la même transaction pour éviter une progression
 * partiellement validée si l’opération est interrompue.
 */
export async function toggleExerciseStepValidation(
  db: SQLiteDatabase,
  exerciseId: number,
  stepOrder: number,
) {
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'DELETE FROM exercise_step_progress WHERE exercise_id = ? AND step_order = ?',
      exerciseId,
      stepOrder,
    );

    if (result.changes === 0) {
      await db.runAsync(
        `INSERT OR IGNORE INTO exercise_step_progress (exercise_id, step_order, validated_at)
         SELECT exercise_id, step_order, ?
         FROM exercise_steps
         WHERE exercise_id = ? AND step_order <= ?`,
        Date.now(),
        exerciseId,
        stepOrder,
      );
    }
  });
}

// ---------- Types de séance ----------

export async function getSeanceTypes(db: SQLiteDatabase): Promise<SeanceType[]> {
  return db.getAllAsync<SeanceType>("SELECT * FROM activity_types ORDER BY name");
}

export async function createSeanceType(
  db: SQLiteDatabase,
  name: string,
  color = "",
): Promise<number> {
  const result = await db.runAsync(
    "INSERT INTO activity_types (name, color) VALUES (?, ?)",
    name,
    color,
  );
  return result.lastInsertRowId;
}

export async function deleteSeanceType(db: SQLiteDatabase, seanceTypeId: number) {
  await db.runAsync("DELETE FROM activity_types WHERE id = ?", seanceTypeId);
}

// ---------- Séances ----------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Timestamp (midi local) d'un jour au format YYYY-MM-DD. */
function dayTimestamp(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/** Deux exos identiques mis à la suite dans une routine = faire les 2 côtés :
 *  la première entrée devient « droit », la suivante « gauche ». */
function assignConsecutiveSides<T extends { exercise_id: number; side: SetSide | null }>(
  entries: T[],
): void {
  let i = 0;
  while (i < entries.length) {
    if (entries[i].side === null) {
      let j = i;
      while (
        j < entries.length &&
        entries[j].exercise_id === entries[i].exercise_id &&
        entries[j].side === null
      ) {
        j++;
      }
      if (j - i >= 2) {
        for (let k = i; k < j; k++) {
          entries[k].side = (k - i) % 2 === 0 ? "right" : "left";
        }
      }
      i = j;
    } else {
      i++;
    }
  }
}

export async function startWorkout(
  db: SQLiteDatabase,
  templateId?: number,
  date?: string,
): Promise<number> {
  let workoutId = 0;
  await db.withTransactionAsync(async () => {
    const day = date ?? today();
    // Séance rétroactive : on ancre le début au midi du jour choisi.
    const startedAt = day === today() ? Date.now() : dayTimestamp(day);
    let name = "";
    let color = "";
    if (templateId) {
      const tpl = await db.getFirstAsync<Template>(
        "SELECT * FROM templates WHERE id = ?",
        templateId,
      );
      name = tpl?.name ?? "";
      color = tpl?.color ?? "";
      const tExercises = await db.getAllAsync<TemplateExercise>(
        "SELECT * FROM template_exercises WHERE template_id = ? ORDER BY order_index",
        templateId,
      );
      const result = await db.runAsync(
        `INSERT INTO workouts (name, date, started_at, completed, template_id, color)
           VALUES (?, ?, ?, 0, ?, ?)`,
        name,
        day,
        startedAt,
        templateId,
        color,
      );
      workoutId = result.lastInsertRowId;
      for (const [i, te] of tExercises.entries()) {
        const tSets = await db.getAllAsync<TemplateSet>(
          "SELECT * FROM template_sets WHERE template_exercise_id = ? ORDER BY set_index",
          te.id,
        );
        if (tSets.length > 0) {
          for (const [s, ts] of tSets.entries()) {
            const timed = te.set_type === "time";
            await db.runAsync(
              `INSERT INTO sets (workout_id, exercise_id, weight, reps, duration, set_order, side)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              workoutId,
              te.exercise_id,
              timed ? 0 : (ts.target_weight ?? 0),
              timed ? 0 : ts.target_reps,
              timed ? (ts.target_seconds ?? 0) : null,
              i * 100 + s,
              te.side ?? null,
            );
          }
        } else {
          const timed = te.set_type === "time";
          for (let s = 0; s < te.target_sets; s++) {
            await db.runAsync(
              `INSERT INTO sets (workout_id, exercise_id, weight, reps, duration, set_order, side)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              workoutId,
              te.exercise_id,
              timed ? 0 : (te.target_weight ?? 0),
              timed ? 0 : te.target_reps,
              timed ? (te.target_seconds ?? 0) : null,
              i * 100 + s,
              te.side ?? null,
            );
          }
        }
      }
    } else {
      const result = await db.runAsync(
        "INSERT INTO workouts (name, date, started_at, completed) VALUES (?, ?, ?, 0)",
        "",
        day,
        startedAt,
      );
      workoutId = result.lastInsertRowId;
    }
  });
  return workoutId;
}

export async function getActiveWorkout(db: SQLiteDatabase): Promise<Workout | null> {
  return db.getFirstAsync<Workout>(
    "SELECT * FROM workouts WHERE completed = 0 ORDER BY started_at DESC LIMIT 1",
  );
}

/** Crée la colonne duration_min si elle manque (base non migrée). */
async function ensureDurationColumn(db: SQLiteDatabase) {
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(workouts)");
  if (!cols.some((c) => c.name === "duration_min")) {
    await db.execAsync("ALTER TABLE workouts ADD COLUMN duration_min INTEGER");
  }
}

/** Ajoute directement une séance terminée hors musculation (grimpe, vélo, course…). */
export async function logSeanceWorkout(
  db: SQLiteDatabase,
  name: string,
  durationMin: number,
  notes = "",
  color = "",
  date?: string,
): Promise<number> {
  await ensureDurationColumn(db);
  const day = date ?? today();
  // Séance passée : la fin est ancrée au midi du jour choisi.
  const endedAt = day === today() ? Date.now() : dayTimestamp(day);
  const result = await db.runAsync(
    `INSERT INTO workouts (name, date, started_at, ended_at, completed, duration_min, notes, color)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    name,
    day,
    endedAt - durationMin * 60000,
    endedAt,
    durationMin,
    notes,
    color,
  );
  return result.lastInsertRowId;
}

/** Valide rétroactivement une routine comme séance terminée à une date passée. */
export async function validateRoutineOnDate(
  db: SQLiteDatabase,
  templateId: number,
  date: string,
): Promise<number> {
  const workoutId = await startWorkout(db, templateId, date);
  await db.runAsync("UPDATE sets SET done = 1 WHERE workout_id = ?", workoutId);
  await finishWorkout(db, workoutId, undefined, dayTimestamp(date));
  return workoutId;
}

/** Jours d'entraînement sur les N derniers mois : une entrée par séance (couleur + nb de séries), pour la heatmap. */
export async function getWorkoutDays(db: SQLiteDatabase, months = 6) {
  return db.getAllAsync<{ day: string; set_count: number; color: string }>(
    `SELECT w.date AS day,
            COALESCE(SUM(CASE WHEN s.done = 1 THEN 1 ELSE 0 END), 0) AS set_count,
            COALESCE(
              NULLIF(w.color, ''),
              NULLIF((SELECT t.color FROM templates t WHERE t.id = w.template_id), ''),
              ''
            ) AS color
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     WHERE w.completed = 1
       AND w.name <> 'Validation manuelle'
       AND w.date >= date('now', ?)
     GROUP BY w.id ORDER BY w.started_at`,
    `-${months} month`,
  );
}

/** Regroupe les séances par jour (la heatmap découpe ensuite la cellule par séance). */
export async function getWorkoutDaysGrouped(db: SQLiteDatabase, months = 6) {
  const rows = await getWorkoutDays(db, months);
  const byDay = new Map<string, { count: number; colors: string[] }>();
  for (const r of rows) {
    let entry = byDay.get(r.day);
    if (!entry) {
      entry = { count: 0, colors: [] };
      byDay.set(r.day, entry);
    }
    entry.count += r.set_count;
    entry.colors.push(r.color);
  }
  return byDay;
}

export async function getWorkouts(
  db: SQLiteDatabase,
  limit = 100,
  offset = 0,
): Promise<(Workout & { total_volume: number; set_count: number })[]> {
  return db.getAllAsync(
    `SELECT w.*,
            COALESCE(SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END), 0) AS total_volume,
            COUNT(s.id) AS set_count
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     WHERE w.name <> 'Validation manuelle'
     GROUP BY w.id ORDER BY w.started_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset,
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

export async function getWorkoutDetail(
  db: SQLiteDatabase,
  workoutId: number,
): Promise<WorkoutDetail | null> {
  const workout = await db.getFirstAsync<Workout>("SELECT * FROM workouts WHERE id = ?", workoutId);
  if (!workout) return null;
  const rows = await db.getAllAsync<
    WorkoutSet & { e_name: string; e_muscle: string; e_equipment: string; e_custom: number }
  >(
    `SELECT s.*, e.name AS e_name, e.muscle AS e_muscle, e.equipment AS e_equipment, e.is_custom AS e_custom
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_id = ? ORDER BY s.set_order, s.id`,
    workoutId,
  );
  const byExercise = new Map<string, WorkoutDetailGroup>();
  for (const r of rows) {
    const key = `${r.exercise_id}|${r.side ?? ""}`;
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

export async function finishWorkout(
  db: SQLiteDatabase,
  workoutId: number,
  notes?: string,
  endedAt?: number,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE workouts SET completed = 1, ended_at = ?, notes = COALESCE(?, notes) WHERE id = ?",
      endedAt ?? Date.now(),
      notes ?? null,
      workoutId,
    );
    const completedExercises = await db.getAllAsync<{ name: string }>(
      `SELECT e.name FROM sets s JOIN exercises e ON e.id = s.exercise_id
       WHERE s.workout_id = ? AND s.done = 1`,
      workoutId,
    );
    await validateProgressionsFromExerciseNames(
      db,
      completedExercises.map((exercise) => exercise.name),
    );
  });
}

export async function updateWorkoutName(db: SQLiteDatabase, workoutId: number, name: string) {
  await db.runAsync("UPDATE workouts SET name = ? WHERE id = ?", name, workoutId);
}

export async function deleteWorkout(db: SQLiteDatabase, workoutId: number) {
  await db.runAsync("DELETE FROM workouts WHERE id = ?", workoutId);
}

export async function duplicateWorkout(db: SQLiteDatabase, workoutId: number): Promise<number> {
  let newId = 0;
  await db.withTransactionAsync(async () => {
    const src = await db.getFirstAsync<Workout>("SELECT * FROM workouts WHERE id = ?", workoutId);
    if (!src) throw new Error("workout not found");
    const result = await db.runAsync(
      "INSERT INTO workouts (name, date, started_at, ended_at, notes, completed, color) VALUES (?, ?, ?, ?, ?, 0, ?)",
      src.name,
      today(),
      Date.now(),
      null as unknown as number,
      "",
      src.color,
    );
    newId = result.lastInsertRowId;
    const rows = await db.getAllAsync<
      Pick<
        WorkoutSet,
        "exercise_id" | "weight" | "reps" | "duration" | "set_order" | "superset_group" | "side"
      >
    >(
      "SELECT exercise_id, weight, reps, duration, set_order, superset_group, side FROM sets WHERE workout_id = ? ORDER BY set_order",
      workoutId,
    );
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO sets (workout_id, exercise_id, weight, reps, duration, set_order, superset_group, side)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        r.exercise_id,
        r.weight,
        r.reps,
        r.duration,
        r.set_order,
        r.superset_group,
        r.side,
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
  side: SetSide | null = null,
) {
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    "SELECT MAX(set_order) AS max_order FROM sets WHERE workout_id = ? AND exercise_id = ? AND side IS ?",
    workoutId,
    exerciseId,
    side,
  );
  const lastSet = await db.getFirstAsync<{ weight: number; reps: number; duration: number | null }>(
    "SELECT weight, reps, duration FROM sets WHERE workout_id = ? AND exercise_id = ? AND side IS ? ORDER BY set_order DESC LIMIT 1",
    workoutId,
    exerciseId,
    side,
  );
  const result = await db.runAsync(
    "INSERT INTO sets (workout_id, exercise_id, weight, reps, duration, set_order, side) VALUES (?, ?, ?, ?, ?, ?, ?)",
    workoutId,
    exerciseId,
    lastSet?.weight ?? weight,
    lastSet?.reps ?? reps,
    lastSet?.duration ?? null,
    (row?.max_order ?? -1) + 1,
    side,
  );
  return result.lastInsertRowId;
}

export type SetUpdates = Partial<
  Pick<WorkoutSet, "weight" | "reps" | "duration" | "rpe" | "done" | "superset_group">
>;

export async function updateSet(db: SQLiteDatabase, setId: number, updates: SetUpdates) {
  const fields: string[] = [];
  const params: (number | null)[] = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(value as number | null);
  }
  if (!fields.length) return;
  params.push(setId);
  await db.runAsync(`UPDATE sets SET ${fields.join(", ")} WHERE id = ?`, ...params);
}

export async function deleteSet(db: SQLiteDatabase, setId: number) {
  await db.runAsync("DELETE FROM sets WHERE id = ?", setId);
}

export async function getPreviousSets(
  db: SQLiteDatabase,
  exerciseId: number,
  beforeWorkoutId?: number,
) {
  const condition = beforeWorkoutId ? "AND w.id != ?" : "";
  const params: number[] = [exerciseId];
  if (beforeWorkoutId) params.push(beforeWorkoutId);
  return db.getAllAsync<WorkoutSet & { date: string }>(
    `SELECT s.*, w.date FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.completed = 1 ${condition}
     ORDER BY w.started_at DESC LIMIT 20`,
    ...params,
  );
}

// ---------- Templates / Routines ----------

export async function getTemplates(
  db: SQLiteDatabase,
): Promise<(Template & { exercise_count: number })[]> {
  return db.getAllAsync(
    `SELECT t.*, COUNT(te.id) AS exercise_count
     FROM templates t LEFT JOIN template_exercises te ON te.template_id = t.id
     GROUP BY t.id ORDER BY t.name`,
  );
}

/** Réordonne les exercices d'une routine selon l'ordre des ids fourni. */
export async function reorderTemplateExercises(db: SQLiteDatabase, orderedIds: number[]) {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync(
        "UPDATE template_exercises SET order_index = ? WHERE id = ?",
        i,
        orderedIds[i],
      );
    }
  });
}

export async function getTemplateDetail(db: SQLiteDatabase, templateId: number) {
  const template = await db.getFirstAsync<Template>(
    "SELECT * FROM templates WHERE id = ?",
    templateId,
  );
  if (!template) return null;
  const rows = await db.getAllAsync<
    TemplateExercise & { e_name: string; e_muscle: string; e_equipment: string; e_custom: number }
  >(
    `SELECT te.*, e.name AS e_name, e.muscle AS e_muscle, e.equipment AS e_equipment, e.is_custom AS e_custom
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? ORDER BY te.order_index`,
    templateId,
  );
  const exercises = [];
  for (const r of rows) {
    exercises.push({
      ...r,
      sets: await ensureTemplateSets(db, r),
      exercise: {
        id: r.exercise_id,
        name: r.e_name,
        muscle: r.e_muscle,
        equipment: r.e_equipment,
        is_custom: r.e_custom,
      } as Exercise,
    });
  }
  return { ...template, exercises };
}

/** Garantit une ligne par série pour un exercice de routine (amorce depuis les cibles uniformes si besoin). */
async function ensureTemplateSets(
  db: SQLiteDatabase,
  te: Pick<
    TemplateExercise,
    "id" | "target_sets" | "target_reps" | "target_weight" | "set_type" | "target_seconds"
  >,
): Promise<TemplateSet[]> {
  let sets = await db.getAllAsync<TemplateSet>(
    "SELECT * FROM template_sets WHERE template_exercise_id = ? ORDER BY set_index",
    te.id,
  );
  if (sets.length === 0) {
    for (let i = 0; i < te.target_sets; i++) {
      await db.runAsync(
        "INSERT INTO template_sets (template_exercise_id, set_index, target_reps, target_weight, target_seconds) VALUES (?, ?, ?, ?, ?)",
        te.id,
        i,
        te.target_reps,
        te.target_weight,
        te.target_seconds ?? 0,
      );
    }
    sets = await db.getAllAsync<TemplateSet>(
      "SELECT * FROM template_sets WHERE template_exercise_id = ? ORDER BY set_index",
      te.id,
    );
  }
  return sets;
}

/** Ajuste le nombre de séries cibles : les valeurs existantes sont conservées. */
export async function setTemplateExerciseSetCount(
  db: SQLiteDatabase,
  templateExerciseId: number,
  count: number,
) {
  await db.withTransactionAsync(async () => {
    const current = await db.getAllAsync<TemplateSet>(
      "SELECT * FROM template_sets WHERE template_exercise_id = ? ORDER BY set_index",
      templateExerciseId,
    );
    if (current.length === 0) {
      const te = await db.getFirstAsync<
        Pick<
          TemplateExercise,
          "id" | "target_sets" | "target_reps" | "target_weight" | "set_type" | "target_seconds"
        >
      >(
        "SELECT id, target_sets, target_reps, target_weight, set_type, target_seconds FROM template_exercises WHERE id = ?",
        templateExerciseId,
      );
      if (!te) throw new Error("template exercise not found");
      const lastReps = te.target_reps;
      const lastWeight = te.target_weight;
      const lastSeconds = te.set_type === "time" ? te.target_seconds || 30 : 0;
      for (let i = 0; i < count; i++) {
        await db.runAsync(
          "INSERT INTO template_sets (template_exercise_id, set_index, target_reps, target_weight, target_seconds) VALUES (?, ?, ?, ?, ?)",
          templateExerciseId,
          i,
          lastReps,
          lastWeight,
          lastSeconds,
        );
      }
    } else if (count > current.length) {
      const last = current[current.length - 1];
      for (let i = current.length; i < count; i++) {
        await db.runAsync(
          "INSERT INTO template_sets (template_exercise_id, set_index, target_reps, target_weight, target_seconds) VALUES (?, ?, ?, ?, ?)",
          templateExerciseId,
          i,
          last.target_reps,
          last.target_weight,
          last.target_seconds,
        );
      }
    } else if (count < current.length) {
      await db.runAsync(
        "DELETE FROM template_sets WHERE template_exercise_id = ? AND set_index >= ?",
        templateExerciseId,
        count,
      );
    }
    // Champ legacy gardé en cohérence.
    await db.runAsync(
      "UPDATE template_exercises SET target_sets = ? WHERE id = ?",
      count,
      templateExerciseId,
    );
  });
}

export type TemplateSetUpdates = Partial<
  Pick<TemplateSet, "target_reps" | "target_weight" | "target_seconds">
>;

export async function updateTemplateSet(
  db: SQLiteDatabase,
  setId: number,
  updates: TemplateSetUpdates,
) {
  const fields: string[] = [];
  const params: number[] = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(value as number);
  }
  if (!fields.length) return;
  params.push(setId);
  await db.runAsync(`UPDATE template_sets SET ${fields.join(", ")} WHERE id = ?`, ...params);
}

export async function createTemplate(
  db: SQLiteDatabase,
  name: string,
  color = "",
): Promise<number> {
  const result = await db.runAsync(
    "INSERT INTO templates (name, notes, color) VALUES (?, ?, ?)",
    name,
    "",
    color,
  );
  return result.lastInsertRowId;
}

export async function updateTemplateColor(db: SQLiteDatabase, templateId: number, color: string) {
  await db.runAsync("UPDATE templates SET color = ? WHERE id = ?", color, templateId);
}

export async function renameTemplate(db: SQLiteDatabase, templateId: number, name: string) {
  await db.runAsync("UPDATE templates SET name = ? WHERE id = ?", name, templateId);
}

export async function deleteTemplate(db: SQLiteDatabase, templateId: number) {
  await db.runAsync("DELETE FROM templates WHERE id = ?", templateId);
}

export async function addTemplateExercise(
  db: SQLiteDatabase,
  templateId: number,
  exerciseId: number,
  targetSets = 3,
  targetReps = 10,
) {
  const row = await db.getFirstAsync<{ max_idx: number | null }>(
    "SELECT MAX(order_index) AS max_idx FROM template_exercises WHERE template_id = ?",
    templateId,
  );
  await db.runAsync(
    "INSERT INTO template_exercises (template_id, exercise_id, target_sets, target_reps, order_index) VALUES (?, ?, ?, ?, ?)",
    templateId,
    exerciseId,
    targetSets,
    targetReps,
    (row?.max_idx ?? -1) + 1,
  );
}

export type TemplateExerciseUpdates = Partial<
  Pick<
    TemplateExercise,
    "target_sets" | "target_reps" | "target_weight" | "set_type" | "target_seconds" | "side"
  >
>;

export async function updateTemplateExercise(
  db: SQLiteDatabase,
  templateExerciseId: number,
  updates: TemplateExerciseUpdates,
) {
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(value as string | number | null);
  }
  if (!fields.length) return;
  params.push(templateExerciseId);
  await db.runAsync(`UPDATE template_exercises SET ${fields.join(", ")} WHERE id = ?`, ...params);
}

export async function removeTemplateExercise(db: SQLiteDatabase, templateExerciseId: number) {
  await db.runAsync("DELETE FROM template_exercises WHERE id = ?", templateExerciseId);
}

/** Remplace le contenu du template par ce qui a réellement été fait pendant la séance (exos, séries, poids/reps).
 *  Seules les séries cochées « faites » comptent ; on retombe sur toutes les séries si aucune n'est cochée.
 *  Regroupement par exercice ET côté pour préserver les entrées unilatérales.
 *  Les cibles par série (reps/poids) sont conservées une par une. */
export async function syncTemplateFromWorkout(
  db: SQLiteDatabase,
  templateId: number,
  workoutId: number,
) {
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{
      exercise_id: number;
      weight: number;
      reps: number;
      duration: number | null;
      set_order: number;
      side: SetSide | null;
      done: number;
    }>(
      "SELECT exercise_id, weight, reps, duration, set_order, side, done FROM sets WHERE workout_id = ? ORDER BY set_order, id",
      workoutId,
    );
    // Séance vide : on ne touche pas à la routine plutôt que de la vider.
    if (rows.length === 0) return;

    interface Group {
      exercise_id: number;
      side: SetSide | null;
      order: number;
      sets: { weight: number; reps: number; duration: number | null }[];
      doneCount: number;
    }
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const key = `${r.exercise_id}|${r.side ?? ""}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          exercise_id: r.exercise_id,
          side: r.side ?? null,
          order: r.set_order,
          sets: [],
          doneCount: 0,
        };
        groups.set(key, g);
      }
      g.sets.push({ weight: r.weight, reps: r.reps, duration: r.duration });
      if (r.done === 1) g.doneCount++;
    }
    await db.runAsync("DELETE FROM template_exercises WHERE template_id = ?", templateId);
    const sorted = [...groups.values()].sort((a, b) => a.order - b.order);
    // On préserve la paire droite/gauche pour les exos dupliqués sans côté explicite.
    assignConsecutiveSides(sorted);
    let i = 0;
    for (const g of sorted) {
      const used = g.doneCount > 0 ? g.sets.slice(-g.doneCount) : g.sets;
      const last = used[used.length - 1];
      const timed = used.every((s) => s.duration !== null && s.duration !== undefined);
      const result = await db.runAsync(
        `INSERT INTO template_exercises (template_id, exercise_id, target_sets, target_reps, target_weight, set_type, target_seconds, order_index, side)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        templateId,
        g.exercise_id,
        used.length,
        last.reps,
        last.weight,
        timed ? "time" : "reps",
        timed ? (last.duration ?? 0) : 0,
        i++,
        g.side,
      );
      const teId = result.lastInsertRowId;
      for (const [s, st] of used.entries()) {
        await db.runAsync(
          "INSERT INTO template_sets (template_exercise_id, set_index, target_reps, target_weight, target_seconds) VALUES (?, ?, ?, ?, ?)",
          teId,
          s,
          st.reps,
          st.weight,
          st.duration ?? 0,
        );
      }
    }
  });
}

// ---------- Stats ----------

export interface ExerciseHistoryEntry {
  date: string;
  started_at: number;
  volume: number;
  best_set_reps: number;
  top_weight: number;
  side_details?: {
    left?: { volume: number; best_set_reps: number; top_weight: number };
    right?: { volume: number; best_set_reps: number; top_weight: number };
  };
}

export async function getExerciseHistory(db: SQLiteDatabase, exerciseId: number) {
  const rows = await db.getAllAsync<{
    date: string;
    started_at: number;
    side: string | null;
    volume: number;
    best_set_reps: number;
    top_weight: number;
  }>(
    `SELECT w.date, w.started_at, s.side,
            SUM(CASE WHEN s.done = 1 THEN s.weight * s.reps ELSE 0 END) AS volume,
            MAX(s.reps) AS best_set_reps,
            MAX(s.weight) AS top_weight
     FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.completed = 1 AND s.done = 1
     GROUP BY w.id, s.side ORDER BY w.started_at ASC`,
    exerciseId,
  );
  const merged = new Map<number, ExerciseHistoryEntry>();
  for (const r of rows) {
    let entry = merged.get(r.started_at);
    if (!entry) {
      entry = {
        date: r.date,
        started_at: r.started_at,
        volume: 0,
        best_set_reps: 0,
        top_weight: 0,
      };
      merged.set(r.started_at, entry);
    }
    entry.volume += r.volume;
    entry.best_set_reps = Math.max(entry.best_set_reps, r.best_set_reps);
    entry.top_weight = Math.max(entry.top_weight, r.top_weight);
    if (r.side === "left" || r.side === "right") {
      entry.side_details ??= {};
      const detail = { volume: r.volume, best_set_reps: r.best_set_reps, top_weight: r.top_weight };
      if (r.side === "left") entry.side_details.left = detail;
      else entry.side_details.right = detail;
    }
  }
  return [...merged.values()];
}

export async function getPersonalRecords(db: SQLiteDatabase, days?: number, tag?: string) {
  const periodFilter = days ? `AND w.date >= date('now', '-${days} days')` : "";
  const tagFilter = tag ? "AND (',' || COALESCE(e.tags, '') || ',') LIKE ?" : "";
  return db.getAllAsync<{
    exercise_id: number;
    name: string;
    top_weight: number;
    top_weight_left: number | null;
    top_weight_right: number | null;
    best_set_reps: number;
    best_set_reps_left: number | null;
    best_set_reps_right: number | null;
    date: string;
  }>(
    `SELECT s.exercise_id, e.name,
            MAX(s.weight) AS top_weight,
            MAX(CASE WHEN s.side = 'left' THEN s.weight END) AS top_weight_left,
            MAX(CASE WHEN s.side = 'right' THEN s.weight END) AS top_weight_right,
            MAX(s.reps) AS best_set_reps,
            MAX(CASE WHEN s.side = 'left' THEN s.reps END) AS best_set_reps_left,
            MAX(CASE WHEN s.side = 'right' THEN s.reps END) AS best_set_reps_right,
            (SELECT w2.date FROM sets s2 JOIN workouts w2 ON w2.id = s2.workout_id
             WHERE s2.exercise_id = s.exercise_id AND w2.completed = 1 AND s2.done = 1
               AND s2.side IS s.side ${periodFilter}
             ORDER BY s2.weight DESC, s2.reps DESC LIMIT 1) AS date
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.completed = 1 AND s.done = 1 ${periodFilter} ${tagFilter}
     GROUP BY s.exercise_id ORDER BY top_weight DESC, best_set_reps DESC`,
    ...(tag ? [`%,${tag},%`] : []),
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
    weeks,
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
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     WHERE w.completed = 1
       AND w.name <> 'Validation manuelle'
       -- Le modificateur "weekday 1" avance au lundi suivant : le jeudi,
       -- "weekday 1", "-6 days" commencerait donc le mardi. On retire
       -- explicitement le nombre de jours écoulés depuis lundi.
       AND w.date >= date(
         'now',
         'localtime',
         printf('-%d days', (CAST(strftime('%w', 'now', 'localtime') AS INTEGER) + 6) % 7)
       )
       AND w.date <= date('now', 'localtime')
     GROUP BY w.date ORDER BY w.date`,
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
    `-${sinceDays} days`,
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
       (SELECT COALESCE(SUM(w.ended_at - w.started_at), 0) FROM workouts w WHERE w.completed = 1 AND w.ended_at IS NOT NULL AND w.started_at IS NOT NULL) AS total_duration`,
  );
}

// ---------- Réglages ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

/**
 * Supprime les données créées par l'utilisateur sans toucher au catalogue livré
 * avec l'application (exercices intégrés et étapes de progression).
 */
export async function deleteAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
DELETE FROM sets;
DELETE FROM workouts;
DELETE FROM template_sets;
DELETE FROM template_exercises;
DELETE FROM templates;
DELETE FROM activity_types;
DELETE FROM exercise_step_progress;
DELETE FROM exercises WHERE is_custom = 1;
`);
  });
}

// ---------- Import Strong ----------

/** Association mémorisée entre un nom Strong et un exercice de l'application. */
export interface ImportExerciseMapping {
  sourceName: string;
  targetName: string;
  targetMuscle: string;
}

/**
 * Les mappings sont volontairement dans une table séparée des données de
 * l'utilisateur : « Supprimer mes données » ne les efface pas.
 */
export async function getImportExerciseMappings(
  db: SQLiteDatabase,
): Promise<ImportExerciseMapping[]> {
  return db.getAllAsync<ImportExerciseMapping>(
    `SELECT source_name AS sourceName, target_name AS targetName, target_muscle AS targetMuscle
     FROM import_exercise_mappings
     ORDER BY source_name`,
  );
}

export interface ImportStats {
  imported: number;
  skipped: number;
  setsImported: number;
  exercisesCreated: number;
  routinesCreated: number;
}

/**
 * Noms d'exercices du CSV sans correspondance dans la base
 * (ils seront créés comme exercices personnalisés sauf association manuelle).
 */
export async function getUnmatchedImportExercises(
  db: SQLiteDatabase,
  workouts: { sets: { exerciseName: string }[] }[],
): Promise<string[]> {
  const [exercises, mappings] = await Promise.all([
    db.getAllAsync<{ id: number; name: string }>(
      "SELECT id, name FROM exercises ORDER BY name",
    ),
    getImportExerciseMappings(db),
  ]);
  const matcher = createExerciseMatcher(exercises);
  const mappedNames = new Set(mappings.map((mapping) => mapping.sourceName));
  const names = new Set<string>();
  for (const w of workouts) {
    for (const s of w.sets) {
      if (!mappedNames.has(s.exerciseName) && !matcher.find(s.exerciseName)) {
        names.add(s.exerciseName);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Rejoue l'historique terminé dans le suivi des étapes : une étape réalisée
 * valide cette étape et toutes celles qui la précèdent dans chaque progression
 * correspondante. Les validations manuelles déjà présentes sont conservées.
 */
async function syncExerciseStepProgressFromHistory(
  db: Pick<SQLiteDatabase, "runAsync" | "getAllAsync">,
) {
  const [progressions, historicalExercises] = await Promise.all([
    db.getAllAsync<{ id: number; name: string }>(
      "SELECT id, name FROM exercises WHERE COALESCE(category, '') != ''",
    ),
    db.getAllAsync<{ name: string; completed_at: number }>(
      `SELECT e.name, MAX(COALESCE(w.ended_at, w.started_at, 0)) AS completed_at
       FROM exercises e
       JOIN sets s ON s.exercise_id = e.id
       JOIN workouts w ON w.id = s.workout_id
       WHERE w.completed = 1 AND s.done = 1
       GROUP BY e.id, e.name`,
    ),
  ]);

  const progressionIdByKey = new Map(
    progressions.map((progression) => [normalizeSkillName(progression.name), progression.id]),
  );
  const historicalCompletionByKey = new Map(
    historicalExercises.map((exercise) => [
      normalizeSkillName(exercise.name),
      exercise.completed_at || Date.now(),
    ]),
  );

  for (const entry of SKILL_STEPS) {
    const progressionId = progressionIdByKey.get(entry.key);
    if (!progressionId) continue;

    for (const [stepOrder, step] of entry.steps.entries()) {
      const validatedAt = historicalCompletionByKey.get(normalizeSkillName(step.name));
      if (validatedAt === undefined) continue;

      for (let precedingOrder = 0; precedingOrder <= stepOrder; precedingOrder++) {
        await db.runAsync(
          `INSERT OR IGNORE INTO exercise_step_progress
             (exercise_id, step_order, validated_at) VALUES (?, ?, ?)`,
          progressionId,
          precedingOrder,
          validatedAt,
        );
      }
    }
  }
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
      side?: "left" | "right" | null;
    }[];
  }[],
  /** Association manuelle nom CSV -> id d'exercice existant (null = nouvel exercice forcé). */
  exerciseOverrides: Record<string, number | null> = {},
  /** Groupe musculaire choisi pendant le matching (nom CSV -> muscle). */
  newExerciseMuscles: Record<string, string> = {},
): Promise<ImportStats> {
  const stats: ImportStats = {
    imported: 0,
    skipped: 0,
    setsImported: 0,
    exercisesCreated: 0,
    routinesCreated: 0,
  };

  const existing = new Set(
    (
      await db.getAllAsync<{ started_at: number }>(
        "SELECT started_at FROM workouts WHERE started_at IS NOT NULL",
      )
    ).map((r) => r.started_at),
  );

  // Matching des noms d'exercices du CSV avec les exercices existants
  const [existingExercises, savedMappings] = await Promise.all([
    db.getAllAsync<{ id: number; name: string; muscle: string }>(
      "SELECT id, name FROM exercises ORDER BY name",
    ),
    getImportExerciseMappings(db),
  ]);
  const matcher = createExerciseMatcher(existingExercises);
  const exerciseById = new Map(existingExercises.map((exercise) => [exercise.id, exercise]));
  const savedMappingBySource = new Map(
    savedMappings.map((mapping) => [mapping.sourceName, mapping]),
  );

  // Résolution nom CSV -> id d'exercice, mémorisée pour construire les routines
  const resolvedByName = new Map<string, number>();
  const updatedOverrideMuscles = new Set<string>();
  // Séances importées par nom de routine (on garde la plus récente comme référence)
  const importedByName = new Map<
    string,
    {
      startedAt: number;
      workoutIds: number[];
      sets: {
        exerciseName: string;
        weight: number;
        reps: number;
        side?: "left" | "right" | null;
      }[];
    }
  >();

  // withExclusiveTransactionAsync n'est pas supporté sur web (SQLite WASM)
  const execImport = async (
    txn: Pick<SQLiteDatabase, "runAsync" | "getFirstAsync" | "getAllAsync">,
  ) => {
    // On mémorise uniquement les choix explicites. Un matching automatique ne
    // doit pas devenir une règle permanente pour de futurs CSV.
    for (const [sourceName, targetId] of Object.entries(exerciseOverrides)) {
      const target = targetId === null ? null : exerciseById.get(targetId);
      if (targetId !== null && !target) continue;
      await txn.runAsync(
        `INSERT INTO import_exercise_mappings (source_name, target_name, target_muscle)
         VALUES (?, ?, ?)
         ON CONFLICT(source_name) DO UPDATE SET
           target_name = excluded.target_name,
           target_muscle = excluded.target_muscle`,
        sourceName,
        target?.name ?? sourceName,
        newExerciseMuscles[sourceName] ?? target?.muscle ?? "fullbody",
      );
    }

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
        w.notes,
      );
      const workoutId = result.lastInsertRowId;

      for (const s of w.sets) {
        let ex: { id: number; name: string; muscle: string } | null;
        const hasOverride = Object.prototype.hasOwnProperty.call(exerciseOverrides, s.exerciseName);
        const overrideId = exerciseOverrides[s.exerciseName];
        if (hasOverride && overrideId !== null) {
          const selectedMuscle = newExerciseMuscles[s.exerciseName];
          const muscleUpdateKey = `${overrideId}:${selectedMuscle ?? ""}`;
          if (selectedMuscle && !updatedOverrideMuscles.has(muscleUpdateKey)) {
            await txn.runAsync(
              "UPDATE exercises SET muscle = ? WHERE id = ?",
              selectedMuscle,
              overrideId,
            );
            updatedOverrideMuscles.add(muscleUpdateKey);
          }
          ex = {
            id: overrideId,
            name: s.exerciseName,
            muscle: selectedMuscle ?? exerciseById.get(overrideId)?.muscle ?? "fullbody",
          };
        } else if (!hasOverride) {
          const savedMapping = savedMappingBySource.get(s.exerciseName);
          if (savedMapping) {
            // Une cible personnalisée peut avoir été supprimée avec les
            // données. Le mapping reste alors utilisable et la recrée.
            ex = matcher.findExact(savedMapping.targetName);
            if (!ex) {
              const result = await txn.runAsync(
                "INSERT INTO exercises (name, muscle, equipment, is_custom) VALUES (?, ?, ?, 1)",
                savedMapping.targetName,
                savedMapping.targetMuscle,
                "other",
              );
              ex = {
                id: result.lastInsertRowId,
                name: savedMapping.targetName,
                muscle: savedMapping.targetMuscle,
              };
              matcher.add(ex);
              stats.exercisesCreated++;
            }
          } else {
            ex = matcher.find(s.exerciseName);
          }
        } else {
          ex = null;
        }
        if (!ex) {
          const result = await txn.runAsync(
            "INSERT INTO exercises (name, muscle, equipment, is_custom) VALUES (?, ?, ?, 1)",
            s.exerciseName,
            newExerciseMuscles[s.exerciseName] ?? "fullbody",
            "other",
          );
          ex = {
            id: result.lastInsertRowId,
            name: s.exerciseName,
            muscle: newExerciseMuscles[s.exerciseName] ?? "fullbody",
          };
          matcher.add(ex);
          stats.exercisesCreated++;
        }
        resolvedByName.set(s.exerciseName, ex.id);
        await txn.runAsync(
          `INSERT INTO sets (workout_id, exercise_id, weight, reps, rpe, done, set_order, side)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          workoutId,
          ex.id,
          s.weight,
          s.reps,
          s.rpe,
          s.order,
          s.side ?? null,
        );
        stats.setsImported++;
      }

      const prev = w.name ? importedByName.get(w.name) : undefined;
      if (!prev) {
        importedByName.set(w.name, { startedAt: w.startedAt, workoutIds: [workoutId], sets: w.sets });
      } else {
        prev.workoutIds.push(workoutId);
        if (w.startedAt > prev.startedAt) {
          prev.startedAt = w.startedAt;
          prev.sets = w.sets;
        }
      }
      existing.add(w.startedAt);
      stats.imported++;
    }

    await syncExerciseStepProgressFromHistory(txn);
    await createRoutinesFromImports(txn, importedByName, resolvedByName, stats);
  };

  if (Platform.OS === "web") {
    await db.withTransactionAsync(() => execImport(db));
  } else {
    await db.withExclusiveTransactionAsync(execImport);
  }

  return stats;
}

/**
 * Crée une routine par nom de séance importée (la plus récente sert de
 * référence pour l'ordre des exercices et les cibles). Un exercice unilatéral
 * enregistré deux fois (bloc droit puis bloc gauche) donne deux entrées :
 * la première côté droit, la seconde côté gauche.
 */
async function createRoutinesFromImports(
  txn: Pick<SQLiteDatabase, "runAsync" | "getAllAsync">,
  importedByName: Map<
    string,
    {
      startedAt: number;
      workoutIds: number[];
      sets: {
        exerciseName: string;
        weight: number;
        reps: number;
        side?: "left" | "right" | null;
      }[];
    }
  >,
  resolvedByName: Map<string, number>,
  stats: ImportStats,
) {
  const existingTemplates = new Map(
    (
      await txn.getAllAsync<{ id: number; name: string; color: string }>(
        "SELECT id, name, color FROM templates",
      )
    ).map((r) => [r.name, r] as const),
  );
  const usedRoutineColors = new Set(
    [...existingTemplates.values()]
      .map((r) => r.color)
      .filter(Boolean),
  );
  let nextPaletteIndex = 0;
  let generatedColorIndex = 0;

  for (const [name, ref] of importedByName) {
    if (!name.trim()) continue;

    // Entrées dans l'ordre de première apparition ; pour un exercice
    // unilatéral le tri stable du parseur place le bloc droit avant le bloc
    // gauche, donc la routine alterne bien droit puis gauche.
    const entries = new Map<
      string,
      { exerciseId: number; side: SetSide | null; weights: number[]; reps: number[] }
    >();
    for (const s of ref.sets) {
      const exerciseId = resolvedByName.get(s.exerciseName);
      if (exerciseId === undefined) continue;
      const key = `${s.exerciseName}|${s.side ?? ""}`;
      let e = entries.get(key);
      if (!e) {
        e = { exerciseId, side: s.side ?? null, weights: [], reps: [] };
        entries.set(key, e);
      }
      e.weights.push(s.weight);
      e.reps.push(s.reps);
    }
    if (entries.size === 0) continue;

    const existing = existingTemplates.get(name);
    let templateId: number;
    let color: string;
    let created = false;
    if (existing) {
      templateId = existing.id;
      color = existing.color || ROUTINE_COLORS[0];
    } else {
      color = getNextRoutineColor(
        usedRoutineColors,
        () => ROUTINE_COLORS[nextPaletteIndex++ % ROUTINE_COLORS.length],
        () => getGeneratedRoutineColor(generatedColorIndex++),
      );
      templateId = (
        await txn.runAsync(
          "INSERT INTO templates (name, notes, color) VALUES (?, ?, ?)",
          name,
          "",
          color,
        )
      ).lastInsertRowId;
      created = true;

      let orderIndex = 0;
      for (const e of entries.values()) {
        await txn.runAsync(
          `INSERT INTO template_exercises (template_id, exercise_id, target_sets, target_reps, target_weight, order_index, side)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          templateId,
          e.exerciseId,
          e.weights.length,
          mostCommon(e.reps),
          roundHalf(e.weights.reduce((a, b) => Math.max(a, b), 0)),
          orderIndex,
          e.side,
        );
        orderIndex++;
      }
      existingTemplates.set(name, { id: templateId, name, color });
    }

    // Les séances importées sont créées avant leur routine de référence.
    // Rattachons-les maintenant afin de conserver leur couleur dans
    // l'historique et lors d'une duplication.
    const placeholders = ref.workoutIds.map(() => '?').join(', ');
    await txn.runAsync(
      `UPDATE workouts SET template_id = ?, color = ? WHERE id IN (${placeholders})`,
      templateId,
      color,
      ...ref.workoutIds,
    );
    if (created) stats.routinesCreated++;
  }
}

/** Choisit une couleur inutilisée, avec un repli distinct si toute la palette est prise. */
function getNextRoutineColor(
  usedColors: Set<string>,
  getPaletteColor: () => string,
  getFallbackColor: () => string,
): string {
  for (let i = 0; i < ROUTINE_COLORS.length; i++) {
    const color = getPaletteColor();
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }

  let color = getFallbackColor();
  while (usedColors.has(color)) color = getFallbackColor();
  usedColors.add(color);
  return color;
}

function getGeneratedRoutineColor(index: number): string {
  // L’angle d’or répartit les teintes pour rester visuellement distinctif.
  const hue = (index * 137.508) % 360;
  const saturation = 65 / 100;
  const lightness = 48 / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r, g, b] =
    section < 1
      ? [chroma, x, 0]
      : section < 2
        ? [x, chroma, 0]
        : section < 3
          ? [0, chroma, x]
          : section < 4
            ? [0, x, chroma]
            : section < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const match = 2 * lightness - chroma;
  return `#${[r, g, b]
    .map((value) =>
      Math.round((value + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Valeur la plus fréquente (repli : moyenne arrondie). */
function mostCommon(values: number[]): number {
  if (values.length === 0) return 10;
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}
