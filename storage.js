/**
 * storage.js — Persistent Storage Module
 *
 * Schema versions:
 *   v1 — initial
 *   v2 — added revisionCount to lectures
 *   v3 — added notes (string) to lectures, bestStreak to program
 *   v4 — added streakFreezes (number, max 3) to program
 */

const STORAGE_KEY    = 'iit_learn_program_v1';
const SCHEMA_VERSION = 4;

/** Return a fresh default program state */
export function createDefaultProgram() {
  return {
    schemaVersion:  SCHEMA_VERSION,
    weeks:          [],
    totalXP:        0,
    level:          1,
    streak:         0,
    bestStreak:     0,
    streakFreezes:  0,    // v4: earned by completing weeks, used automatically on missed days
    lastActiveDate: null,
    xpHistory:      {}
  };
}

/** Load program from localStorage. Returns default if not found. */
export function loadProgram() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgram();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('[Storage] Load failed, using default:', err);
    return createDefaultProgram();
  }
}

/** Persist program to localStorage. */
export function saveProgram(program) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(program));
    return true;
  } catch (err) {
    console.error('[Storage] Save failed:', err);
    if (err.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Export a backup then delete some old weeks.');
    }
    return false;
  }
}

/** Clear all saved data */
export function clearProgram() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export full program as a downloadable JSON file.
 * Filename includes the date so backups are easy to identify.
 * Returns the filename string.
 */
export function exportBackup(program) {
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `iit-learn-backup-${date}.json`;
  const blob     = new Blob([JSON.stringify(program, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}

/**
 * Validate and parse an imported JSON backup.
 * Returns { ok: true, program } or { ok: false, error: string }.
 */
export function parseImportedBackup(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (!data || typeof data !== 'object')
      return { ok: false, error: 'Not a valid JSON file.' };
    if (!Array.isArray(data.weeks))
      return { ok: false, error: 'Missing "weeks" — this is not an IIT Learn backup.' };
    if (typeof data.totalXP !== 'number')
      return { ok: false, error: 'Missing "totalXP" — invalid backup file.' };

    return { ok: true, program: migrate(data) };
  } catch (err) {
    return { ok: false, error: `Could not read file: ${err.message}` };
  }
}

/** Schema migrations — runs on load and on import */
function migrate(data) {
  const v = data.schemaVersion || 0;

  if (v < 2) {
    for (const week of (data.weeks || []))
      for (const lec of (week.lectures || []))
        if (lec.revisionCount === undefined) lec.revisionCount = 0;
    data.schemaVersion = 2;
  }

  if (v < 3) {
    for (const week of (data.weeks || []))
      for (const lec of (week.lectures || []))
        if (lec.notes === undefined) lec.notes = '';
    if (data.bestStreak === undefined) data.bestStreak = data.streak || 0;
    data.schemaVersion = 3;
  }

  if (v < 4) {
    if (data.streakFreezes === undefined) data.streakFreezes = 0;
    data.schemaVersion = 4;
  }

  // Ensure all top-level fields exist (defensive, for future safety)
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

/** Return today as YYYY-MM-DD */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
