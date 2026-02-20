# Σ IIT Learn — Gamified Study Tracker

> An offline-first PWA for tracking IIT Madras Online BS coursework — with XP, levels, streaks, and lifetime stats.
> **Live:** https://mazyad-entrepreneur.github.io/iitmbs-learning-engine/

---

## ✅ Feature Status (All Working)

| Feature | Status | Notes |
|---|---|---|
| Add / rename / delete weeks | ✅ Working | |
| Add / rename / delete lectures | ✅ Working | |
| XP system (real-time) | ✅ Working | Updates instantly on every action |
| Level progression | ✅ Working | 250 XP per level |
| Streak tracking | ✅ Working | Uses your **real device clock** |
| Streak freeze (auto-use) | ✅ Working | Earns on week completion, auto-uses if you miss a day |
| Activity questions stepper | ✅ Working | |
| Revision counter | ✅ Working | |
| Quick notes (per lecture) | ✅ Working | Auto-saves with 500ms debounce |
| Weekly milestones | ✅ Working | Memory Note, Final Note, Week Complete |
| Lifetime stats panel | ✅ Working | All values are real, not dummy |
| XP history graph (30 days) | ✅ Working | Real dates from your device |
| Export backup (JSON) | ✅ Working | Downloads timestamped file |
| Import backup (JSON) | ✅ Working | Replaces current data after confirmation |
| Offline support (PWA) | ✅ Working | Installable on mobile & desktop |
| Data persistence | ✅ Working | Saved to `localStorage` — survives page refresh |

---

## 📅 How Dates Work (Not Dummy!)

The app uses your **device's real clock** — no server, no backend, no internet required for date tracking.

**Streak system:**
- Every time you open the app, it reads today's date (`new Date()`)
- If you opened it yesterday and open again today → streak increases by 1
- If you miss 1 day and have a ❄️ Streak Freeze → it auto-uses the freeze and your streak is preserved
- If you miss 2+ days → streak resets to 1

**XP history & graph:**
- Every XP you earn is stored under today's date as a key: `{ "2025-02-20": 47, "2025-02-19": 32 }`
- The graph shows the last 30 real calendar days
- "Active Days" = count of days where you earned any XP
- "XP This Month" = sum of all XP earned in the current calendar month

**Example:** If you open the app today (Feb 20) and check off a lecture, you'll see:
- `Active Days: 1`
- `XP This Month: 5` (or whatever you earned)
- The bar for Feb 20 on the graph fills up

All of this is real. Nothing is simulated.

---

## 🚀 How to Use

### Getting Started

1. Open the app: https://mazyad-entrepreneur.github.io/iitmbs-learning-engine/
2. Click **`+ Add Week`** in the top toolbar
3. Enter a name like `Week 1: Linear Algebra` → Confirm
4. The week card appears. Click the arrow `›` or the name to expand it.

### Adding Lectures

1. Inside a week, click **`+ Add Lecture`**
2. Name it like `Lecture 3: Eigenvalues`
3. Click the lecture row to expand it

### Tracking a Lecture

Inside an expanded lecture, you'll see:

| Action | XP | How to use |
|---|---|---|
| **Watched** | +5 XP | Click the row to toggle ✓ |
| **Memory Note** | +7 XP | Click to toggle ✓ |
| **Final Note** | +5 XP | Click to toggle ✓ |
| **Activity Questions** | +1 XP each | Use `+T`/`−T` to set total, `+1`/`↩` to mark done |
| **Revisions** | +10 XP each | `+1` each time you revisit the lecture |
| **Quick Notes** | — | Just type — auto-saves after 0.5s |

> 💡 **Tip:** The `W M F` pills on the lecture summary show your Watched/Memory/Final status at a glance.

### Completing a Week

Inside an open week, scroll to **WEEKLY MILESTONES**:

| Action | XP | Condition |
|---|---|---|
| Weekly Memory Note | +10 XP | Anytime |
| Weekly Final Note | +10 XP | Anytime |
| Mark Week Complete | +15 XP | Only after all lectures have Watched + Memory + Final done |

✅ When you mark a week complete, you also **earn a ❄️ Streak Freeze** (up to 3 max).

### Assignments

Inside each week, find the **ASSIGNMENTS** section:
- **Practice** and **Graded** question trackers
- Set the total with `+T`/`−T`, mark done with `+1`/`↩`
- Each done question = **+2 XP**

---

## 📊 Stats Panel

Click **`◎ Stats`** in the toolbar to see:

| Stat | Meaning |
|---|---|
| Total XP | All XP earned ever |
| Level | 1 level per 250 XP |
| Best Streak | Your longest ever daily streak |
| Active Days | Total days where you earned any XP |
| XP This Month | XP earned in the current calendar month |
| Weeks Done | Completed weeks / total weeks |
| Lectures Core Done | Lectures with all 3 core actions (W+M+F) / total |
| Total Revisions | Sum of all revision counters across all lectures |
| Activity Qs Done | Total activity questions marked done |
| Practice Qs Done | Total practice questions done |
| Graded Qs Done | Total graded questions done |
| Streak Freezes | How many freezes you currently hold (max 3) |

---

## 📈 XP Graph

Click **`▼ XP Graph`** to see a bar chart of your XP earned per day over the last 30 days.
- **Amber/orange bar** = today
- **Teal/green bar** = past days
- Date labels appear every 5 days + always on today

---

## 💾 Export & Import

- **`⬇ Export`** — Downloads a `.json` backup file named `iit-learn-backup-YYYY-MM-DD.json`
- **`⬆ Import`** — Opens a file picker, select your `.json` backup. You'll see a preview before confirming.

> ⚠️ Import **replaces all your current data**. Always export first as a safety backup.

---

## 📱 Install as an App (PWA)

The app is installable as a Progressive Web App — works offline after first load.

**On Android (Chrome):**
1. Open the app in Chrome
2. Tap the menu (⋮) → "Add to Home Screen"

**On Desktop (Chrome/Edge):**
1. Look for the install icon (⊕) in the address bar
2. Click "Install"

Once installed, it works completely **offline**.

---

## 🗂️ Architecture

```
iitmbs-learning-engine/
├── index.html      — App shell (HTML structure only)
├── styles.css      — All styles
├── app.js          — State orchestrator (dispatch, render, init)
├── storage.js      — localStorage persistence + schema migrations
├── xpEngine.js     — Pure XP calculation functions (no DOM)
├── ui.js           — DOM rendering module
├── sw.js           — Service worker (offline caching)
└── manifest.json   — PWA manifest
```

**Data flow:** `User action → dispatch() in app.js → update state → xpEngine recalculates → save to localStorage → re-render UI`

XP is always **recalculated from scratch** on every state change — no double-counting possible.

---

## 🏆 XP Rules Summary

```
Per Lecture:
  Watched          +5 XP
  Memory Note      +7 XP
  Activity Q       +1 XP each (up to total set)
  Final Note       +5 XP
  Revision         +10 XP each (unlimited)

Per Week:
  Practice Q       +2 XP each
  Graded Q         +2 XP each
  Weekly Memory    +10 XP
  Weekly Final     +10 XP
  Week Complete    +15 XP (requires all lectures: W+M+F)

Levels:
  250 XP per level
```

---

## 🔮 Roadmap

- [ ] Mock test / quiz mode
- [ ] Spaced revision reminders
- [ ] Per-week analytics charts
- [ ] Subject/course grouping
- [ ] Cloud sync (free tier)
