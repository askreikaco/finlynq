/**
 * Total order for ops (D7): (hlc.ms, hlc.counter, deviceId, opId), lexicographic.
 * Returns -1, 0 or 1. PROTOTYPE, unreviewed.
 */
import { compareHlc, type Hlc } from "../clock/hlc";

export interface OrderKey {
  hlc: Hlc;
  deviceId: string;
  opId: string;
}

export function compareOrder(a: OrderKey, b: OrderKey): number {
  const byHlc = compareHlc(a.hlc, b.hlc);
  if (byHlc !== 0) return byHlc;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  if (a.opId !== b.opId) return a.opId < b.opId ? -1 : 1;
  return 0;
}
