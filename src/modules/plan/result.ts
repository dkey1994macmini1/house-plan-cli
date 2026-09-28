import type {
  Diagnostic,
  Envelope,
  Failure,
  FailureType,
  HousePlan,
} from "./model.js";

export const failure = (
  type: FailureType,
  message: string,
  hint: string,
  diagnostics?: readonly Diagnostic[],
): Failure => ({
  ok: false,
  schemaVersion: 1,
  error: {
    type,
    message,
    hint,
    ...(diagnostics?.length ? { diagnostics } : {}),
  },
});

export const success = <T>(
  type: string,
  data: T,
  revision?: number,
  diagnostics?: readonly Diagnostic[],
): Envelope<T> => ({
  ok: true,
  type,
  schemaVersion: 1,
  data,
  meta: {
    ...(revision === undefined ? {} : { revision }),
    ...(diagnostics?.length ? { diagnostics } : {}),
  },
});

export const emptyPlan = (): HousePlan => ({
  schemaVersion: 1,
  revision: 0,
  levels: [],
  storeys: [],
});
