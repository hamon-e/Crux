import { registerWebModule, NativeModule } from 'expo';

// WorkoutTimerNotificationModule is not available on the web platform.
class WorkoutTimerNotificationModule extends NativeModule<{}> {}

export default registerWebModule(WorkoutTimerNotificationModule, 'WorkoutTimerNotificationModule');
