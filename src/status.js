/*
 * A tiny store for "is my data safe right now?".
 *
 * Every local write pings noteWrite(), the sync engine pings noteSync().
 * The status bar subscribes, so you get live confirmation on every screen —
 * not just the one you're least likely to be looking at mid-session.
 */
const state = {
  lastWriteAt: null,     // last time anything hit IndexedDB
  lastSyncAt: null,      // last successful push+pull
  sync: "local",         // local | syncing | synced | pending | error | offline
  pending: 0,
  signedIn: false,
  lastError: null,
};

const subs = new Set();
const emit = () => subs.forEach((fn) => fn({ ...state }));

export const getStatus = () => ({ ...state });
export function subscribe(fn) {
  subs.add(fn);
  fn({ ...state });
  return () => subs.delete(fn);
}

export function noteWrite() {
  state.lastWriteAt = Date.now();
  emit();
}

export function noteSync(kind, pending, error) {
  state.sync = kind;
  if (typeof pending === "number") state.pending = pending;
  if (kind === "synced") { state.lastSyncAt = Date.now(); state.lastError = null; }
  if (error !== undefined) state.lastError = error;
  emit();
}

export function noteAuth(signedIn) {
  state.signedIn = signedIn;
  emit();
}

export function notePending(n) {
  state.pending = n;
  emit();
}
