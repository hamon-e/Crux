import type { Progression } from '@/db/queries';

export const TIERS = ['fundamental', 'beginner', 'intermediate', 'advanced', 'ultimate'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  fundamental: 'Fondamentaux',
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  ultimate: 'Ultimes',
};

export const TIER_ICONS: Record<Tier, string> = {
  fundamental: '🌱',
  beginner: '🌿',
  intermediate: '⚡',
  advanced: '🔥',
  ultimate: '👑',
};

export const TIER_COLORS: Record<Tier, string> = {
  fundamental: '#34c759',
  beginner: '#5ac8fa',
  intermediate: '#ffd60a',
  advanced: '#ff9500',
  ultimate: '#af52de',
};

/** Progression moyenne requise dans le palier précédent pour débloquer le suivant. */
export const UNLOCK_THRESHOLD = 0.5;

export interface SkillNode extends Progression {
  tier: Tier;
  progress: number;
  mastered: boolean;
  unlocked: boolean;
}

export function tierOf(difficulty: string): Tier {
  return (TIERS as readonly string[]).includes(difficulty) ? (difficulty as Tier) : 'ultimate';
}

/**
 * Construit l'arbre : progression calculée depuis les séances et déblocage
 * par palier (au moins la moitié du palier précédent de la même catégorie
 * doit être maîtrisée). Les fondamentaux sont toujours débloqués.
 */
export function buildSkillTree(progressions: Progression[]): Record<Tier, SkillNode[]> {
  const nodes: SkillNode[] = progressions.map((s) => ({
    ...s,
    tier: tierOf(s.difficulty),
    progress: s.sessions > 0 ? 1 : 0,
    mastered: s.sessions > 0,
    unlocked: false,
  }));

  for (const tier of TIERS.slice(1)) {
    const prevTier = TIERS[TIERS.indexOf(tier) - 1];
    const prevNodes = nodes.filter((n) => n.tier === prevTier);
    if (prevNodes.length === 0) continue;

    const byCategory = new Map<string, { total: number; sum: number }>();
    for (const n of prevNodes) {
      const entry = byCategory.get(n.category) ?? { total: 0, sum: 0 };
      entry.total++;
      entry.sum += n.progress;
      byCategory.set(n.category, entry);
    }

    for (const node of nodes) {
      if (node.tier !== tier || node.unlocked) continue;
      const stats = byCategory.get(node.category);
      // Sans prérequis dans la même catégorie, on regarde tous les paliers.
      const avg =
        stats && stats.total > 0
          ? stats.sum / stats.total
          : prevNodes.reduce((acc, n) => acc + n.progress, 0) / prevNodes.length;
      if (avg >= UNLOCK_THRESHOLD) node.unlocked = true;
    }
  }
  for (const node of nodes) {
    if (node.tier === 'fundamental') node.unlocked = true;
  }

  const tree = {
    fundamental: [],
    beginner: [],
    intermediate: [],
    advanced: [],
    ultimate: [],
  } as Record<Tier, SkillNode[]>;
  for (const node of nodes) tree[node.tier].push(node);
  return tree;
}
