import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

export type WorkoutTimerActivityProps = {
  startedAt: number;
  workoutName: string;
};

const WorkoutTimerActivity = (
  props: WorkoutTimerActivityProps,
  _environment: LiveActivityEnvironment,
) => {
  "widget";
  const start = new Date(props.startedAt);
  const end = new Date(props.startedAt + 24 * 60 * 60 * 1000);

  const Timer = ({ size = 22 }: { size?: number }) => (
    <Text
      timerInterval={{ lower: start, upper: end }}
      countsDown={false}
      modifiers={[font({ weight: "bold", size }), monospacedDigit(), foregroundStyle("#FFD60A")]}
    />
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          containerBackground("#1C1C1E", "widget"),
          frame({ maxWidth: Infinity, alignment: "leading" }),
          padding({ all: 16 }),
        ]}
      >
        <HStack spacing={8}>
          <Image systemName="stopwatch.fill" color="#FFD60A" />
          <Text modifiers={[font({ weight: "semibold", size: 15 })]}>Chronomètre</Text>
          <Spacer />
          <Timer />
        </HStack>
        <Text modifiers={[font({ size: 14 }), foregroundStyle("#FFFFFFB3")]}>
          {props.workoutName || "Séance en cours"}
        </Text>
      </VStack>
    ),
    compactLeading: <Image systemName="stopwatch.fill" color="#FFD60A" />,
    compactTrailing: <Timer size={14} />,
    minimal: <Image systemName="stopwatch.fill" color="#FFD60A" />,
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 8 })]}>
        <Image systemName="stopwatch.fill" color="#FFD60A" />
        <Text modifiers={[font({ weight: "semibold", size: 14 })]}>Crux</Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 8 })]}>
        <Timer size={18} />
      </HStack>
    ),
    expandedBottom: (
      <Text modifiers={[font({ size: 13 }), foregroundStyle("#FFFFFFB3"), padding({ all: 8 })]}>
        {props.workoutName || "Séance en cours"}
      </Text>
    ),
  };
};

export default createLiveActivity<WorkoutTimerActivityProps>(
  "WorkoutTimerActivity",
  WorkoutTimerActivity,
);
