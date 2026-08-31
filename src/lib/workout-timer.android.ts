import * as Notifications from "expo-notifications";

import WorkoutTimerNotification from "../../modules/workout-timer-notification/src/WorkoutTimerNotificationModule";

let timerGeneration = 0;

function permissionGranted(status: Notifications.NotificationPermissionsStatus) {
  return status.granted;
}

export async function startSystemWorkoutTimer(startedAt: number, workoutName: string) {
  const generation = ++timerGeneration;
  let permission = await Notifications.getPermissionsAsync();
  if (!permissionGranted(permission)) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (generation === timerGeneration && permissionGranted(permission)) {
    WorkoutTimerNotification.start(startedAt, workoutName);
  }
}

export async function stopSystemWorkoutTimer() {
  timerGeneration += 1;
  WorkoutTimerNotification.stop();
}
