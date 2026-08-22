export type SetSide = 'left' | 'right';

export interface ParsedSet {
  exerciseName: string;
  order: number;
  weight: number;
  reps: number;
  rpe: number | null;
  side: SetSide | null;
}

export interface ParsedWorkout {
  dateStr: string;
  startedAt: number;
  name: string;
  durationSec: number | null;
  notes: string;
  sets: ParsedSet[];
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || text.length);
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis >= commas ? ';' : ',';
}

function toNumber(value: string): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function parseStrongDate(dateStr: string): number {
  // Format Strong : "2025-01-08 12:03:21" en heure locale
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
  }
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

/**
 * Parse un export CSV de l'app Strong.
 * Formats connus : "Workout #;Date;Workout Name;Duration (sec);Exercise Name;Set Order;Weight (kg);Reps;RPE;..."
 * ou variante avec virgules sans Workout #.
 */
export function parseStrongCsv(text: string): ParsedWorkout[] {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);

  // Découpage en lignes respectant les champs multi-lignes quotés
  const rows: string[][] = [];
  let field = '';
  let rowFields: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      rowFields.push(field.trim());
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      rowFields.push(field.trim());
      field = '';
      if (rowFields.length > 1 || rowFields[0] !== '') rows.push(rowFields);
      rowFields = [];
    } else {
      field += c;
    }
  }
  rowFields.push(field.trim());
  if (rowFields.length > 1 || rowFields[0] !== '') rows.push(rowFields);

  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const idx = (...names: string[]) => {
    for (const name of names) {
      const i = header.findIndex((h) => h.includes(name));
      if (i !== -1) return i;
    }
    return -1;
  };

  const colWorkoutNum = idx('workout #');
  const colDate = idx('date');
  const colName = idx('workout name', 'routine name');
  const colDuration = idx('duration');
  const colExercise = idx('exercise name', 'exercise');
  const colOrder = idx('set order', 'set');
  const isLbs = header.some((h) => h.includes('weight') && h.includes('lbs'));
  const colWeight = idx('weight');
  const colReps = idx('reps');
  const colRpe = idx('rpe');
  const colNotes = idx('workout notes');

  const lbsToKg = (w: number) => (isLbs ? Math.round(w * 0.45359237 * 10) / 10 : w);

  const workouts = new Map<string, ParsedWorkout>();
  for (const row of rows.slice(1)) {
    const exerciseName = colExercise !== -1 ? row[colExercise] : '';
    if (!exerciseName) continue;

    const dateStr = colDate !== -1 ? row[colDate] : '';
    const workoutNum = colWorkoutNum !== -1 ? row[colWorkoutNum] : '';
    const key = `${workoutNum}|${dateStr}`;

    let workout = workouts.get(key);
    if (!workout) {
      workout = {
        dateStr,
        startedAt: parseStrongDate(dateStr),
        name: colName !== -1 ? row[colName] : '',
        durationSec: colDuration !== -1 && row[colDuration] ? parseInt(row[colDuration], 10) || null : null,
        notes: colNotes !== -1 ? row[colNotes] : '',
        sets: [],
      };
      workouts.set(key, workout);
    }

    workout.sets.push({
      exerciseName,
      order: colOrder !== -1 ? toNumber(row[colOrder]) : workout.sets.length,
      weight: lbsToKg(colWeight !== -1 ? toNumber(row[colWeight]) : 0),
      reps: colReps !== -1 ? toNumber(row[colReps]) : 0,
      rpe: colRpe !== -1 && row[colRpe] ? toNumber(row[colRpe]) : null,
      side: null,
    });
  }

  for (const w of workouts.values()) {
    // La détection des côtés se fait sur l'ordre brut des lignes du CSV :
    // le tri par set_order peut entrelacer les exercices si le compteur
    // redémarre pour chaque occurrence.
    assignSides(w.sets);
    w.sets.sort((a, b) => a.order - b.order);
  }

  return [...workouts.values()].filter((w) => w.startedAt > 0);
}

/**
 * Exercices unilatéraux : si un même exercice est enregistré deux fois
 * d'affilée dans Strong (ex. 3 séries côté droit puis 3 séries côté
 * gauche), le compteur « Set Order » redémarre à 1 pour la 2e occurrence.
 * On découpe donc chaque suite de lignes du même exercice en sous-séries
 * à chaque redémarrage du compteur : 1re sous-série = côté droit,
 * suivante = côté gauche (en alternance s'il y en a plus de deux).
 */
function assignSides(sets: ParsedSet[]) {
  let i = 0;
  while (i < sets.length) {
    // Suite de lignes consécutives du même exercice
    let end = i + 1;
    while (end < sets.length && sets[end].exerciseName === sets[i].exerciseName) end++;

    // Découpage en sous-séries à chaque redémarrage de set_order
    const groups: number[][] = [];
    let current: number[] = [];
    let prevOrder = -Infinity;
    for (let j = i; j < end; j++) {
      if (sets[j].order <= prevOrder) {
        groups.push(current);
        current = [];
      }
      current.push(j);
      prevOrder = sets[j].order;
    }
    groups.push(current);

    if (groups.length >= 2) {
      groups.forEach((g, gi) => {
        const side: SetSide = gi % 2 === 0 ? 'right' : 'left';
        for (const j of g) sets[j].side = side;
      });
    }
    i = end;
  }
}
