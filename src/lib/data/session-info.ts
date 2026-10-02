/**
 * Tiny client store for "who is signed in and is the DEK unlocked", filled by
 * UnlockGate from /api/auth/session so the data layer does not refetch it.
 */
export type SessionInfo = { userId: string; locked: boolean };

let info: SessionInfo | null = null;
const listeners = new Set<(i: SessionInfo | null) => void>();

export function setSessionInfo(next: SessionInfo | null): void {
  info = next;
  for (const l of listeners) l(info);
}

export function getSessionInfo(): SessionInfo | null {
  return info;
}

export function onSessionInfo(l: (i: SessionInfo | null) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
