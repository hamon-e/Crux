export interface ExerciseRef {
  id: number;
  name: string;
}

/** Alias (formes normalisées) : noms courants de l'app Strong -> noms de la base. */
const ALIASES: Record<string, string> = {
  'knee raise captain s chair': 'knee hip raise on parallel bars',
  'captain s chair knee raise': 'knee hip raise on parallel bars',
  'barbell bench press': 'barbell bench press medium grip',
  deadlift: 'barbell deadlift',
  squat: 'barbell squat',
};

const MIN_SIMILARITY = 0.6;

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 2 && t.endsWith('s') ? t.slice(0, -1) : t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Crée un résolveur qui associe un nom d'exercice (ex: export Strong)
 * à un exercice existant : correspondance exacte, normalisée, compacte,
 * par alias puis par similarité de tokens.
 */
export function createExerciseMatcher<T extends ExerciseRef>(exercises: T[]) {
  const byNormalized = new Map<string, T>();
  const byCompact = new Map<string, T>();
  const indexed: { tokens: Set<string>; ref: T }[] = [];

  const index = (ref: T) => {
    const normalized = normalizeExerciseName(ref.name);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, ref);
    const tokens = new Set(tokenize(normalized));
    if (tokens.size === 0) return;
    const compact = [...tokens].sort().join('');
    if (!byCompact.has(compact)) byCompact.set(compact, ref);
    indexed.push({ tokens, ref });
  };

  for (const e of exercises) index(e);

  function resolve(name: string): T | null {
    const normalized = normalizeExerciseName(name);
    if (!normalized) return null;
    const direct = byNormalized.get(normalized);
    if (direct) return direct;

    const tokens = new Set(tokenize(normalized));
    if (tokens.size === 0) return null;

    const compact = [...tokens].sort().join('');
    const compactMatch = byCompact.get(compact);
    if (compactMatch) return compactMatch;

    const aliased = ALIASES[normalized];
    if (aliased) {
      const aliasMatch = byNormalized.get(aliased) ?? byCompact.get(aliased.split(' ').sort().join(''));
      if (aliasMatch) return aliasMatch;
    }

    let best: { score: number; ref: T } | null = null;
    for (const entry of indexed) {
      const score = jaccard(tokens, entry.tokens);
      if (score >= MIN_SIMILARITY && (!best || score > best.score)) {
        best = { score, ref: entry.ref };
      }
    }
    return best?.ref ?? null;
  }

  return {
    find: resolve,
    /** Enregistre un exercice créé pendant l'import pour les prochains matchs. */
    add: index,
  };
}
