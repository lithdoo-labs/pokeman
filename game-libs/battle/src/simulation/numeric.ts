export class SimulationFailure extends Error {
  constructor(readonly code: "BATTLE_COUNTER_OVERFLOW" | "BATTLE_NUMERIC_OVERFLOW") {
    super(code);
    this.name = "SimulationFailure";
  }
}

export function checkedAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0 || left > Number.MAX_SAFE_INTEGER - right) {
    throw new SimulationFailure("BATTLE_NUMERIC_OVERFLOW");
  }
  return left + right;
}

export function checkedMultiply(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0 || (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left))) {
    throw new SimulationFailure("BATTLE_NUMERIC_OVERFLOW");
  }
  return left * right;
}

export function takeCounter(holder: Record<string, unknown>, key: string): number {
  const value = holder[key];
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) === Number.MAX_SAFE_INTEGER) {
    throw new SimulationFailure("BATTLE_COUNTER_OVERFLOW");
  }
  holder[key] = Number(value) + 1;
  return Number(value);
}
