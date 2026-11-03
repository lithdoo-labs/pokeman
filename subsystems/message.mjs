import { cancelled, completed, defineSubsystem, failed } from "@loomrealm/subsystem";
import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function validateMessageInput(value) {
  if (!exact(value, ["messageKey", "text", "actions"]) || typeof value.messageKey !== "string" || value.messageKey.length === 0
      || typeof value.text !== "string" || value.text.length === 0 || !Array.isArray(value.actions) || value.actions.length === 0) return false;
  const ids = new Set();
  return value.actions.every((action) => exact(action, ["id", "label"])
    && typeof action.id === "string" && action.id.length > 0
    && typeof action.label === "string" && action.label.length > 0
    && !ids.has(action.id) && Boolean(ids.add(action.id)));
}

function stateFor(input, selected) {
  return {
    zIndex: 900,
    roots: [{
      key: "pokeman-message",
      tag: "pokeman-message",
      attrs: { role: "dialog", "aria-modal": "true" },
      data: { messageKey: input.messageKey, text: input.text, actions: input.actions, selected },
      children: [],
    }],
  };
}

export function createPokeManMessageSubsystem(scope, dependencies = {}) {
  const createConsumer = dependencies.createControlsConsumer ?? createControlsConsumer;
  return {
    async frame(frame) {
      if (!validateMessageInput(frame.params)) return failed({ code: "POKEMAN_MESSAGE_INPUT_INVALID" });
      const input = structuredClone(frame.params);
      let selected = 0;
      let domain;
      let controls;
      let settle;
      let settled = false;
      const selection = new Promise((resolve) => { settle = resolve; });
      const finish = (value) => { if (!settled) { settled = true; settle(value); } };
      const render = () => domain.replace(stateFor(input, selected));
      const onAbort = () => finish(cancelled());
      try {
        domain = scope.createRenderDomain(stateFor(input, selected));
        controls = createConsumer(scope.presentationEvents, frame, {
          onEvent(event) {
            if (event.action !== "down" || event.repeat) return;
            if (event.button === "up" || event.button === "left") {
              selected = (selected + input.actions.length - 1) % input.actions.length; render();
            } else if (event.button === "down" || event.button === "right") {
              selected = (selected + 1) % input.actions.length; render();
            } else if (event.button === "south" || event.button === "start") {
              finish(completed({ messageKey: input.messageKey, actionId: input.actions[selected].id }));
            }
          },
        });
        frame.signal.addEventListener("abort", onAbort, { once: true });
        if (frame.signal.aborted) onAbort();
        return await selection;
      } catch {
        return failed({ code: "POKEMAN_MESSAGE_PRESENTATION_FAILED" });
      } finally {
        frame.signal.removeEventListener("abort", onAbort);
        controls?.close();
        domain?.close();
      }
    },
  };
}

export default defineSubsystem((scope) => createPokeManMessageSubsystem(scope));
