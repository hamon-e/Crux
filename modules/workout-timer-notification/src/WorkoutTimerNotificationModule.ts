import { NativeModule, requireNativeModule } from "expo";

declare class WorkoutTimerNotificationModule extends NativeModule<{}> {
  start(startedAt: number, workoutName: string): void;
  stop(): void;
}

export default requireNativeModule<WorkoutTimerNotificationModule>("WorkoutTimerNotification");
