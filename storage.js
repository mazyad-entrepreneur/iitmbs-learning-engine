/**
 * storage.js — Persistent Storage Module
 *
 * Thin abstraction over localStorage. All app state is serialized
 * into a single JSON blob under STORAGE_KEY. This approach keeps
 * migrations simple: bump SCHEMA_VERSION and write a migrate() fn.
 */

const STORAGE_KEY = 'iit_learn_program_v1';
const SCHEMA_VERSION = 2; // bumped v1→v2: added revisionCount to lectures

/** Return a fresh default program state */
export function createDefaultProgram() {
  return {
    schemaVersion: SCHEMA_VERSION,
    weeks: [],
    totalXP: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    xpHistory: {}
  };
}

/** Load program from localStorage. Returns default if not found. */
export function loadProgram() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgram();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.error('[Storage] Load failed, using default:', err);
    return createDefaultProgram();
  }
}

/** Persist program to localStorage. Returns true on success. */
export function saveProgram(program) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(program));
    return true;
  } catch (err) {
    console.error('[Storage] Save failed:', err);
    if (err.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Please clear some data.');
    }
    return false;
  }
}

/** Clear all saved data */
export function clearProgram() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Schema migration: transform old data shapes to current schema.
 */
function migrate(data) {
  const version = data.schemaVersion || 0;

  if (version < 2) {
    // v1 → v2: add revisionCount to all existing lectures
    for (const week of (data.weeks || [])) {
      for (const lec of (week.lectures || [])) {
        if (lec.revisionCount === undefined) lec.revisionCount = 0;
      }
    }
    data.schemaVersion = 2;
  }

  // Ensure all required top-level fields exist (defensive)
  const defaults = createDefaultProgram();
  for (const key of Object.keys(defaults)) {
    if (data[key] === undefined) data[key] = defaults[key];
  }

  return data;
}

/** Generate a unique ID */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Return today's date as YYYY-MM-DD string */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
