import type { LiveActivity } from "expo-widgets";

import WorkoutTimerActivity, {
  type WorkoutTimerActivityProps,
} from "../../widgets/WorkoutTimerActivity";

let currentActivity: LiveActivity<WorkoutTimerActivityProps> | null = null;
let timerGeneration = 0;

export async function startSystemWorkoutTimer(startedAt: number, workoutName: string) {
  const generation = ++timerGeneration;
  await endActivities();
  if (generation !== timerGeneration) return;
  currentActivity = WorkoutTimerActivity.start({ startedAt, workoutName }, "testapp://");
}

export async function stopSystemWorkoutTimer() {
  timerGeneration += 1;
  await endActivities();
}

async function endActivities() {
  const instances = WorkoutTimerActivity.getInstances();
  const activities = instances.length > 0 ? instances : currentActivity ? [currentActivity] : [];
  currentActivity = null;
  await Promise.all(activities.map((activity) => activity.end("immediate")));
}
