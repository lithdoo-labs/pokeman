/**
 * Common Event reachability for bridge scripts.
 * A map event is a bridge candidate only when a 117 target can reach a
 * Common Event that itself contains pbBridgeOn/Off (possibly through nested 117).
 * Autorun/parallel Common Events are a separate execution entrance and are
 * never silently treated as "the whole game has no indirect calls".
 */

const DYNAMIC_CALL = /\b(eval|instance_eval|pbCommonEvent)\s*\(/u;

export function computeCommonEventReachability(commonEvents) {
  const index = new Map(commonEvents.map((event) => [event.id, event]));
  const memo = new Map();

  function pathsFrom(id, stack) {
    if (stack.includes(id)) {
      return Object.freeze({
        canReachBridge: false,
        cycle: true,
        cyclePath: Object.freeze([...stack, id]),
        paths: Object.freeze([]),
        missing: Object.freeze([]),
        dynamic: false,
      });
    }
    if (memo.has(id) && !stack.length) return memo.get(id);
    const event = index.get(id);
    if (!event) {
      return Object.freeze({
        canReachBridge: false,
        missing: Object.freeze([id]),
        paths: Object.freeze([]),
        cycle: false,
        dynamic: false,
      });
    }
    const paths = [];
    const missing = [];
    let dynamic = (event.scriptUncertainty ?? []).some((reason) => (
      reason === "dynamic-ruby-send-or-eval" || reason === "script-calls-pbCommonEvent"
    ));
    const texts = [
      ...(event.concatenatedScripts ?? []).map((group) => group.joinedWithNewlines),
      ...(event.moveRouteScripts ?? []).filter((item) => item.isScript).map((item) => item.scriptText ?? ""),
      ...(event.conditionalBranchScripts ?? []).map((item) => item.scriptText ?? ""),
    ].join("\n");
    if (DYNAMIC_CALL.test(texts)) dynamic = true;
    if (event.hasBridgeScript) paths.push(Object.freeze([id]));
    const nextStack = [...stack, id];
    for (const child of event.calledCommonEventIds ?? []) {
      if (!Number.isSafeInteger(child) || child <= 0) {
        dynamic = true;
        continue;
      }
      const nested = pathsFrom(child, nextStack);
      if (nested.missing) missing.push(...nested.missing);
      if (nested.dynamic) dynamic = true;
      if (nested.canReachBridge) {
        for (const path of nested.paths) paths.push(Object.freeze([id, ...path]));
      }
    }
    const result = Object.freeze({
      canReachBridge: paths.length > 0,
      paths: Object.freeze(paths),
      missing: Object.freeze([...new Set(missing)]),
      cycle: false,
      dynamic,
      hasOwnBridgeScript: event.hasBridgeScript === true,
    });
    if (stack.length === 0) memo.set(id, result);
    return result;
  }

  const byId = {};
  const idsThatCanReachBridge = [];
  const autorunOrParallel = [];
  for (const event of commonEvents) {
    const result = pathsFrom(event.id, []);
    byId[event.id] = result;
    if (result.canReachBridge) idsThatCanReachBridge.push(event.id);
    if (event.trigger === 1 || event.trigger === 2) {
      autorunOrParallel.push(Object.freeze({
        id: event.id,
        name: event.name,
        trigger: event.trigger,
        triggerSemantics: event.trigger === 1 ? "autorun" : "parallel",
        canReachBridge: result.canReachBridge,
        paths: result.paths,
        coverage: "not-a-map-event-117-call; Game_CommonEvent runs independently",
      }));
    }
  }

  return Object.freeze({
    byId: Object.freeze(byId),
    idsThatCanReachBridge: Object.freeze(idsThatCanReachBridge),
    autorunOrParallel: Object.freeze(autorunOrParallel),
    note: "Map-event negatives only cover 117 calls from scanned map events plus nested Common Event lists. Autorun/parallel Common Events and scripted pbCommonEvent/eval calls are separate entrances.",
  });
}

export function chainsFromMapEvent(event, reachability) {
  const chains = [];
  for (const page of event.pages ?? []) {
    for (const command of page.commands ?? []) {
      if (command.code !== 117) continue;
      const id = command.parameters?.[0];
      if (!Number.isSafeInteger(id) || id <= 0) {
        chains.push(Object.freeze({
          pageIndex: page.pageIndex,
          commandIndex: command.index,
          target: id,
          parseable: false,
          canReachBridge: false,
          reason: "common-event-id-not-static-integer",
        }));
        continue;
      }
      const reached = reachability.byId[id];
      chains.push(Object.freeze({
        pageIndex: page.pageIndex,
        commandIndex: command.index,
        target: id,
        parseable: true,
        canReachBridge: reached?.canReachBridge === true,
        paths: reached?.paths ?? Object.freeze([]),
        missing: reached?.missing ?? Object.freeze([]),
        dynamic: reached?.dynamic === true,
      }));
    }
  }
  return Object.freeze(chains);
}
