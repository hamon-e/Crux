type ExerciseTreeSelectionRequest = {
  title: string;
  onSelect: (exerciseId: number) => void | Promise<void>;
};

let currentRequest: ExerciseTreeSelectionRequest | null = null;

/**
 * Conserve l'action de retour pendant que l'écran appelant reste dans la pile
 * de navigation. Les callbacks ne sont volontairement jamais sérialisés dans
 * les paramètres de route.
 */
export function beginExerciseTreeSelection(request: ExerciseTreeSelectionRequest) {
  currentRequest = request;
}

export function getExerciseTreeSelection() {
  return currentRequest;
}

export async function completeExerciseTreeSelection(exerciseId: number) {
  const request = currentRequest;
  if (!request) return false;

  await request.onSelect(exerciseId);
  if (currentRequest === request) currentRequest = null;
  return true;
}
