/**
 * storage.js — Persistent Storage Module
 *
 * Thin abstraction over localStorage. All app state is serialized
 * into a single JSON blob under STORAGE_KEY. This approach keeps
 * migrations simple: bump SCHEMA_VERSION and write a migrate() fn.
 */

const STORAGE_KEY = 'iit_learn_program_v1';
const SCHEMA_VERSION = 1;

/** Return a fresh default program state */
export function createDefaultProgram() {
  return {
    schemaVersion: SCHEMA_VERSION,
    weeks: [],
    totalXP: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,   // ISO date string YYYY-MM-DD
    xpHistory: {}           // { "YYYY-MM-DD": <xp_earned_that_day> }
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
    // Warn user if quota exceeded
    if (err.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Please clear some data.');
    }
    return false;
  }
}

/** Clear all saved data (used for reset) */
export function clearProgram() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Schema migration: transform old data shapes to current schema.
 * Add cases here as schema evolves.
 */
function migrate(data) {
  const version = data.schemaVersion || 0;

  if (version < 1) {
    // Future: migrate from v0 → v1
    data.schemaVersion = 1;
  }

  // Ensure all required top-level fields exist (defensive)
  const defaults = createDefaultProgram();
  for (const key of Object.keys(defaults)) {
    if (data[key] === undefined) data[key] = defaults[key];
  }

  return data;
}

/** Generate a unique ID (timestamp + random suffix) */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Return today's date as YYYY-MM-DD string */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
