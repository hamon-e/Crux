import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_EXERCISES } from './seed-exercises';
import { MOBILITY_EXERCISES } from './mobility-exercises';
import { normalizeSkillName, SKILL_STEPS } from './skill-steps';
import { getSkillVideo } from './skill-media';

export const DATABASE_NAME = 'strong.db';

export const DATABASE_VERSION = 14;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentDbVersion = result?.user_version ?? 0;
  // Pas de retour anticipé : tout ce qui suit est idempotent et auto-réparant
  // (une base marquée « à jour » mais abîmée doit être réparée au lancement).

  // Sécurité : recrée proprement les colonnes si une migration précédente a
  // échoué à mi-chemin (base dans un état incohérent, user_version obsolète).
  const ensureColumn = async (table: string, column: string, definition: string) => {
    try {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      if (!cols.some((c) => c.name === column)) {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    } catch {
      // Table absente : elle sera créée par le bloc de création initial.
    }
  };
  await ensureColumn('workouts', 'duration_min', 'INTEGER');
  await ensureColumn('workouts', 'color', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('workouts', 'side', 'TEXT');
  await ensureColumn('templates', 'color', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('exercises', 'category', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('exercises', 'difficulty', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('exercises', 'video_url', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('exercises', 'tags', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('exercise_steps', 'image', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('exercise_steps', 'video', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('sets', 'side', 'TEXT');
  await ensureColumn('template_exercises', 'target_weight', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('template_exercises', 'side', 'TEXT');
  // Exercices chronométrés (branche main) : garanties sur toutes les bases.
  await ensureColumn('template_exercises', 'set_type', "TEXT NOT NULL DEFAULT 'reps'");
  await ensureColumn('template_exercises', 'target_seconds', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('template_sets', 'target_seconds', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('sets', 'duration', 'INTEGER');
  await db.execAsync(`
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT 'bodyweight',
  is_custom INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS exercise_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  reps TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  video TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_exercise_steps_ex ON exercise_steps(exercise_id);
CREATE TABLE IF NOT EXISTS template_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_exercise_id INTEGER NOT NULL REFERENCES template_exercises(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL,
  target_reps INTEGER NOT NULL DEFAULT 10,
  target_weight REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_sets_te ON template_sets(template_exercise_id);
CREATE TABLE IF NOT EXISTS activity_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT ''
);
`);

  if (currentDbVersion === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT 'bodyweight',
  is_custom INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER,
  color TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  weight REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  rpe REAL,
   done INTEGER NOT NULL DEFAULT 0,
   set_order INTEGER NOT NULL DEFAULT 0,
   superset_group INTEGER,
   side TEXT
);
CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise_id);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  target_sets INTEGER NOT NULL DEFAULT 3,
  target_reps INTEGER NOT NULL DEFAULT 10,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
  }

  if (currentDbVersion < 3) {
    // v2/v3 : catalogue d'exercices avec images.
    // Les exercices personnalisés et ceux référencés par l'historique sont
    // conservés ; leurs métadonnées sont mises à jour depuis le catalogue.
    await db.execAsync(
      'CREATE TEMP TABLE IF NOT EXISTS _catalog (name TEXT PRIMARY KEY, muscle TEXT NOT NULL, equipment TEXT NOT NULL)'
    );
    await db.withTransactionAsync(async () => {
      for (const [name, , , muscle, equipment] of SEED_EXERCISES) {
        await db.runAsync(
          'INSERT OR REPLACE INTO _catalog (name, muscle, equipment) VALUES (?, ?, ?)',
          name,
          muscle,
          equipment
        );
      }
      await db.execAsync(`
DELETE FROM exercises WHERE is_custom = 0 AND id NOT IN (SELECT DISTINCT exercise_id FROM sets);

UPDATE exercises
SET muscle = (SELECT c.muscle FROM _catalog c WHERE c.name = exercises.name),
    equipment = (SELECT c.equipment FROM _catalog c WHERE c.name = exercises.name)
WHERE name IN (SELECT name FROM _catalog);

INSERT OR IGNORE INTO exercises (name, muscle, equipment, is_custom)
SELECT name, muscle, equipment, 0 FROM _catalog;

DROP TABLE _catalog;
`);
    });
  }

  if (currentDbVersion < 4) {
    // v4 : poids cible par exercice dans les routines (0 = non défini).
    await db.execAsync(
      'ALTER TABLE template_exercises ADD COLUMN target_weight REAL NOT NULL DEFAULT 0'
    );
  }

  if (currentDbVersion < 5) {
    // v5 : durée (minutes) des séances hors musculation ajoutées manuellement.
    // Idempotent : évite l'erreur « duplicate column » si une tentative
    // précédente a échoué avant la mise à jour de user_version.
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
    if (!cols.some((c) => c.name === 'duration_min')) {
      await db.execAsync('ALTER TABLE workouts ADD COLUMN duration_min INTEGER');
    }
  }

  if (currentDbVersion < 6) {
    // v6 : côté (droite/gauche) pour les exercices unilatéraux importés.
    // Idempotent : évite l'erreur « duplicate column » si une tentative
    // précédente a échoué avant la mise à jour de user_version.
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sets)');
    if (!cols.some((c) => c.name === 'side')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN side TEXT');
    }
  }

  if (currentDbVersion < 7) {
    // v7 : couleur par routine et par séance (heatmap multicolore).
    // Idempotent : évite l'erreur « duplicate column » si une tentative
    // précédente a échoué avant la mise à jour de user_version.
    const templateCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(templates)');
    if (!templateCols.some((c) => c.name === 'color')) {
      await db.execAsync("ALTER TABLE templates ADD COLUMN color TEXT NOT NULL DEFAULT ''");
    }
    const workoutCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
    if (!workoutCols.some((c) => c.name === 'color')) {
      await db.execAsync("ALTER TABLE workouts ADD COLUMN color TEXT NOT NULL DEFAULT ''");
    }
  }

  if (currentDbVersion < 8) {
    // v8 : types de séance réutilisables (nom + couleur) pour la saisie rapide.
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS activity_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT ''
);
`);
    // Amorçage : les séances déjà saisies deviennent des types réutilisables.
    const typeCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
    if (
      typeCols.some((c) => c.name === 'duration_min') &&
      typeCols.some((c) => c.name === 'color')
    ) {
      await db.execAsync(`
INSERT OR IGNORE INTO activity_types (name, color)
SELECT name, color FROM workouts
WHERE completed = 1 AND name != '' AND duration_min IS NOT NULL
GROUP BY name;
`);
    }
  }

  if (currentDbVersion < 9) {
    // v9 : ré-amorce le catalogue d'exercices (la migration v3 l'effaçait sur
    // les bases sans séries à cause d'un DELETE mal ordonné).
    // Idempotent : ne touche ni aux exercices personnalisés ni à ceux existants.
    await db.execAsync(
      'CREATE TEMP TABLE IF NOT EXISTS _catalog (name TEXT PRIMARY KEY, muscle TEXT NOT NULL, equipment TEXT NOT NULL)'
    );
    await db.withTransactionAsync(async () => {
      for (const [name, , , muscle, equipment] of SEED_EXERCISES) {
        await db.runAsync(
          'INSERT OR REPLACE INTO _catalog (name, muscle, equipment) VALUES (?, ?, ?)',
          name,
          muscle,
          equipment
        );
      }
      await db.execAsync(`
INSERT OR IGNORE INTO exercises (name, muscle, equipment, is_custom)
SELECT name, muscle, equipment, 0 FROM _catalog;

UPDATE exercises
SET muscle = (SELECT c.muscle FROM _catalog c WHERE c.name = exercises.name),
    equipment = (SELECT c.equipment FROM _catalog c WHERE c.name = exercises.name)
WHERE name IN (SELECT name FROM _catalog);

DROP TABLE _catalog;
`);
    });
  }

  if (currentDbVersion < 10) {
    // v10 : côté (droite/gauche) par entrée de routine pour les exercices
    // unilatéraux (le même exercice peut apparaître 2 fois : droit puis gauche).
    // Idempotent : évite l'erreur « duplicate column » si une tentative
    // précédente a échoué avant la mise à jour de user_version.
    const teCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(template_exercises)');
    if (!teCols.some((c) => c.name === 'side')) {
      await db.execAsync('ALTER TABLE template_exercises ADD COLUMN side TEXT');
    }
  }

  if (currentDbVersion < 11) {
    // v11 : cible par série dans les routines (reps et poids propres à chaque série).
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS template_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_exercise_id INTEGER NOT NULL REFERENCES template_exercises(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL,
  target_reps INTEGER NOT NULL DEFAULT 10,
  target_weight REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_sets_te ON template_sets(template_exercise_id);
`);
    // Amorçage : décline les cibles uniformes existantes en lignes par série.
    // On ne le fait que si aucune ligne n'existe déjà (base à moitié migrée).
    const existingSets = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM template_sets'
    );
    if ((existingSets?.c ?? 0) === 0) {
      const tes = await db.getAllAsync<{
        id: number;
        target_sets: number;
        target_reps: number;
        target_weight: number;
      }>('SELECT id, target_sets, target_reps, target_weight FROM template_exercises');
      for (const te of tes) {
        for (let i = 0; i < te.target_sets; i++) {
          await db.runAsync(
            'INSERT INTO template_sets (template_exercise_id, set_index, target_reps, target_weight) VALUES (?, ?, ?, ?)',
            te.id,
            i,
            te.target_reps,
            te.target_weight
          );
        }
      }
    }
  }

  if (currentDbVersion < 12) {
    // v12 (main) : exercices de routine basés sur des répétitions ou du temps.
    const teCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(template_exercises)');
    if (!teCols.some((c) => c.name === 'set_type')) {
      await db.execAsync("ALTER TABLE template_exercises ADD COLUMN set_type TEXT NOT NULL DEFAULT 'reps'");
    }
    if (!teCols.some((c) => c.name === 'target_seconds')) {
      await db.execAsync('ALTER TABLE template_exercises ADD COLUMN target_seconds INTEGER NOT NULL DEFAULT 0');
    }
    const tsCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(template_sets)');
    if (!tsCols.some((c) => c.name === 'target_seconds')) {
      await db.execAsync('ALTER TABLE template_sets ADD COLUMN target_seconds INTEGER NOT NULL DEFAULT 0');
    }
    const setCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sets)');
    if (!setCols.some((c) => c.name === 'duration')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN duration INTEGER');
    }
  }

  if (currentDbVersion < 13) {
    // v13 : le catalogue est remplacé par les compétences de la feuille de
    // calcul (Google Sheets) + colonnes catégorie/difficulté pour l'arbre de
    // compétences. Les exercices personnalisés et ceux référencés par
    // l'historique sont conservés.
    await db.execAsync(`
DELETE FROM exercises
WHERE is_custom = 0 AND COALESCE(category, '') = ''
  AND id NOT IN (SELECT DISTINCT exercise_id FROM sets);
`);

    await db.execAsync(
      'CREATE TEMP TABLE IF NOT EXISTS _catalog (name TEXT PRIMARY KEY, difficulty TEXT NOT NULL, category TEXT NOT NULL, muscle TEXT NOT NULL, equipment TEXT NOT NULL)'
    );
    await db.withTransactionAsync(async () => {
      for (const [name, difficulty, category, muscle, equipment] of SEED_EXERCISES) {
        await db.runAsync(
          'INSERT OR REPLACE INTO _catalog (name, difficulty, category, muscle, equipment) VALUES (?, ?, ?, ?, ?)',
          name,
          difficulty,
          category,
          muscle,
          equipment
        );
      }
      await db.execAsync(`
INSERT OR IGNORE INTO exercises (name, muscle, equipment, is_custom, category, difficulty)
SELECT name, muscle, equipment, 0, category, difficulty FROM _catalog;

UPDATE exercises
SET muscle = (SELECT c.muscle FROM _catalog c WHERE c.name = exercises.name),
    equipment = (SELECT c.equipment FROM _catalog c WHERE c.name = exercises.name),
    category = (SELECT c.category FROM _catalog c WHERE c.name = exercises.name),
    difficulty = (SELECT c.difficulty FROM _catalog c WHERE c.name = exercises.name)
WHERE name IN (SELECT name FROM _catalog);

DROP TABLE _catalog;
`);
    });
  }

  if (currentDbVersion < 14) {
    // v14 : tags d'exercices (« strength » / « mobility »). Les exercices
    // existants hors compétences deviennent « strength » ; le catalogue de
    // mobilité (Flexopedia) est importé avec le tag « mobility ».
    await db.execAsync(`
UPDATE exercises SET tags = 'strength'
WHERE COALESCE(tags, '') = '' AND COALESCE(category, '') = '';
`);

    await db.execAsync(
      'CREATE TEMP TABLE IF NOT EXISTS _mobility (name TEXT PRIMARY KEY, difficulty TEXT NOT NULL, muscle TEXT NOT NULL)'
    );
    await db.withTransactionAsync(async () => {
      for (const [name, difficulty, , muscle] of MOBILITY_EXERCISES) {
        await db.runAsync(
          'INSERT OR REPLACE INTO _mobility (name, difficulty, muscle) VALUES (?, ?, ?)',
          name,
          difficulty,
          muscle
        );
      }
      await db.execAsync(`
INSERT OR IGNORE INTO exercises (name, muscle, equipment, is_custom, tags)
SELECT name, muscle, 'bodyweight', 0, 'mobility' FROM _mobility;

UPDATE exercises
SET muscle = (SELECT c.muscle FROM _mobility c WHERE c.name = exercises.name),
    difficulty = (SELECT c.difficulty FROM _mobility c WHERE c.name = exercises.name),
    tags = CASE WHEN COALESCE(tags, '') = '' THEN 'mobility'
                WHEN tags NOT LIKE '%mobility%' THEN tags || ',mobility'
                ELSE tags END
WHERE name IN (SELECT name FROM _mobility);

DROP TABLE _mobility;
`);
    });
  }

  // v14+ : synchronisation des étapes de progression (avec images) et des
  // vidéos démo Google Drive. Refaite à chaque lancement de migration :
  // idempotente et auto-réparatrice (répare les bases à moitié migrées).
  const skills = await db.getAllAsync<{ id: number; name: string }>(
    "SELECT id, name FROM exercises WHERE COALESCE(category, '') != ''"
  );
  const idByKey = new Map(skills.map((s) => [normalizeSkillName(s.name), s.id]));
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM exercise_steps');
      for (const entry of SKILL_STEPS) {
        const exerciseId = idByKey.get(entry.key);
        if (!exerciseId) continue;
        for (const [i, step] of entry.steps.entries()) {
          await db.runAsync(
            'INSERT INTO exercise_steps (exercise_id, step_order, name, reps, instructions, image, video) VALUES (?, ?, ?, ?, ?, ?, ?)',
            exerciseId,
            i,
            step.name,
            step.reps,
            step.instructions,
            step.image,
            step.video
          );
        }
      const video = getSkillVideo(entry.key);
      if (video) {
        await db.runAsync('UPDATE exercises SET video_url = ? WHERE id = ?', video, exerciseId);
      }
    }
  });

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

