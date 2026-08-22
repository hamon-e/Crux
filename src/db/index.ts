import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_EXERCISES } from './seed-exercises';

export const DATABASE_NAME = 'strong.db';

export const DATABASE_VERSION = 9;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentDbVersion = result?.user_version ?? 0;
  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentDbVersion === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT 'bodyweight',
  is_custom INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  completed INTEGER NOT NULL DEFAULT 0
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
  notes TEXT NOT NULL DEFAULT ''
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
    // v2/v3 : catalogue d'exercices free-exercise-db avec images.
    // Les exercices personnalisés et ceux référencés par l'historique sont
    // conservés ; leurs métadonnées sont mises à jour depuis le catalogue.
    await db.execAsync(
      'CREATE TEMP TABLE IF NOT EXISTS _catalog (name TEXT PRIMARY KEY, muscle TEXT NOT NULL, equipment TEXT NOT NULL)'
    );
    await db.withTransactionAsync(async () => {
      for (const [name, muscle, equipment] of SEED_EXERCISES) {
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
    if (typeCols.some((c) => c.name === 'duration_min')) {
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
      for (const [name, muscle, equipment] of SEED_EXERCISES) {
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

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

