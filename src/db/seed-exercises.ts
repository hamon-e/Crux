import type { Muscle, Equipment } from "./types";

// Compétences issues de la feuille de calcul utilisateur (Google Sheets).
// Tuple : [nom, difficulté, catégorie, muscle, équipement]
export type SeedExercise = readonly [string, string, string, Muscle, Equipment];

const MUSCLE_BY_CATEGORY: Record<string, Muscle> = {
  abs: "core",
  back: "back",
  legs: "quads",
  "upper body": "fullbody",
  skill: "fullbody",
};

function row(name: string, difficulty: string, category: string, equipment: Equipment = "bodyweight"): SeedExercise {
  return [name, difficulty, category, MUSCLE_BY_CATEGORY[category] ?? "fullbody", equipment];
}

export const SEED_EXERCISES: readonly SeedExercise[] = [
  // Compétence ultime (difficulté vide dans la feuille)
  row('Handstand Lower to Planche', 'ultimate', 'skill'),
  // Fundamentals (base)
  row('Ab Fundamental', 'fundamental', 'abs'),
  row('Back Fundamental', 'fundamental', 'back'),
  row('Bodyline Fundamental', 'fundamental', 'abs'),
  row('Dips Fundamental', 'fundamental', 'upper body'),
  row('Handstand Fundamental', 'fundamental', 'skill'),
  row('Pull-up Fundamental', 'fundamental', 'upper body'),
  row('Pushup Fundamental', 'fundamental', 'upper body'),
  row('Side Fundamental', 'fundamental', 'abs'),
  row('Squat Fundamental', 'fundamental', 'legs'),
  // Beginner
  row('Bear Walk', 'beginner', 'skill'),
  row('Calf Raises', 'beginner', 'skill'),
  row('Downward Dog', 'beginner', 'skill'),
  row('Forward Roll', 'beginner', 'skill'),
  row('Wall Squat', 'beginner', 'legs'),
  // Intermediate
  row('Back Plank', 'intermediate', 'back'),
  row('Backward Roll', 'intermediate', 'skill'),
  row('Bridge', 'intermediate', 'skill'),
  row('Cartwheel', 'intermediate', 'skill'),
  row('Cartwheel with One Leg Bent', 'intermediate', 'skill'),
  row('Elevated Bridge (Bridge Prep)', 'intermediate', 'skill'),
  row('Forearm Stand STAGE 1: Wall', 'intermediate', 'skill'),
  row('Forearm Stand STAGE 2. Freestanding', 'intermediate', 'skill'),
  row('Forward Dips', 'intermediate', 'upper body'),
  row('Forward roll+cartwheel', 'intermediate', 'skill'),
  row('Freestanding Headstand', 'intermediate', 'skill'),
  row('Hanging Leg Raises', 'intermediate', 'abs'),
  row('Jumping Grasshopper Pullup', 'intermediate', 'upper body'),
  row('Kick +Wall Handstand', 'intermediate', 'skill'),
  row('Knee Bent Dips', 'intermediate', 'upper body'),
  row('Planche Stage 1: Tuck Hold', 'intermediate', 'abs'),
  row('Wall Headstand', 'intermediate', 'skill'),
  // Advanced
  row('Advanced Obliques', 'advanced', 'abs'),
  row('Back Lever', 'advanced', 'back'),
  row('Box Jump', 'advanced', 'legs'),
  row('Bridge Hip Sit and Extend', 'advanced', 'skill'),
  row('Bridge Pushups', 'advanced', 'skill'),
  row('Cartwheel with Opposite Hand', 'advanced', 'skill'),
  row('Cartwheel with Opposite Leg', 'advanced', 'skill'),
  row('Decline One Arm Pushup', 'advanced', 'upper body'),
  row('Diamond Bridge (Advanced Bridge)', 'advanced', 'skill'),
  row('Freestanding Handstand', 'advanced', 'skill'),
  row('Freestanding Handstand Pushup', 'advanced', 'upper body'),
  row('Front Lever', 'advanced', 'abs'),
  row('Handstand Pirouettes', 'advanced', 'skill'),
  row('Handstand Shoulder Taps', 'advanced', 'skill'),
  row('Handstand Walk', 'advanced', 'skill'),
  row('Human Flag', 'advanced', 'abs'),
  row('Kipping Bar Muscle Up', 'advanced', 'upper body'),
  row('Kipping Ring Muscle Up', 'advanced', 'upper body'),
  row('L-Sit Dips', 'advanced', 'upper body'),
  row('Muscle Up Intro', 'advanced', 'upper body'),
  row('Nordic Curls', 'advanced', 'legs'),
  row('One Arm Pullup', 'advanced', 'upper body'),
  row('One Arm Pushup', 'advanced', 'upper body'),
  row('One Arm Straight Leg V Raise', 'advanced', 'abs'),
  row('Pistol Squat', 'advanced', 'legs'),
  row('Planche Stage 2: Full Planche Hold', 'advanced', 'abs'),
  row('Press Handstand', 'advanced', 'skill'),
  row('Quad Extension', 'advanced', 'legs'),
  row('Ring Dips', 'advanced', 'upper body'),
  row('Side Plank', 'advanced', 'abs'),
  row('Strict Ring Muscle Up', 'advanced', 'upper body'),
  row('Wall Handstand Pushup', 'advanced', 'upper body'),
];
