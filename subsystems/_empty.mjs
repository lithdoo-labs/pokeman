import { completed, defineSubsystem } from "@loomrealm/subsystem";

export function defineEmptySubsystem(subsystem) {
  return defineSubsystem(() => ({
    frame() {
      return completed({ status: "not-implemented", subsystem });
    },
  }));
}
