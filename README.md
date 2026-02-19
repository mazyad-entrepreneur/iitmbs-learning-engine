IIT madras Online BS Learning Engine
Offline-first gamified productivity PWA for IIT-style modular coursework.
Core Features
Week-based structure
Lecture tracking
Activity question tracking
Practice and graded assignments
XP system with recalculation integrity
Weekly completion bonus
Streak tracking
Installable PWA
Fully offline capable
XP Rules
Lecture:
Watch: +5 XP
Memory note: +7 XP
Activity question: +1 XP each
Final note: +5 XP
Weekly:
Practice question: +2 XP each
Graded question: +2 XP each
Weekly memory note: +10 XP
Weekly final note: +10 XP
Week completion bonus: +15 XP
Level:
250 XP per level
Architecture
Modular file structure:
index.html
styles.css
app.js
storage.js
xpEngine.js
ui.js
sw.js
manifest.json
XP is recalculated from scratch on every state change.
Deployment
Hosted on GitHub Pages.
Offline support via service worker.
Long-Term Plan
Future versions:
Advanced analytics
Mock test mode
Revision cycles
Export/import system
