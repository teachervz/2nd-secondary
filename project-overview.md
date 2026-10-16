# Digital Technology 2 — Interactive Lesson Presentations

## Project name and purpose

**Digital Technology 2 Interactive Presentations** (عروض التقنية الرقمية ٢ التفاعلية) is a complete, offline-capable classroom toolkit that turns every lesson of the Saudi *Digital Technology 2* textbook into an interactive, full-screen presentation for teachers.

It is built with plain **HTML + CSS + JavaScript** only — no server, no backend, no database, no build step. A teacher opens `index.html` in a browser and teaches.

Besides the slide decks, it includes a **teacher dashboard** to manage classes and students, a **random name picker**, **participation points**, **lesson completion tracking**, **Excel export**, and **JSON backup/restore** — all stored locally in the browser.

## Target audience

| Item | Value |
|---|---|
| Book | التقنية الرقمية ٢ (Digital Technology 2) — Ministry of Education, Kingdom of Saudi Arabia, edition 1448 AH / 2026 |
| Stage | Secondary education, **Year 2**, Tracks System (نظام المسارات) |
| Students | Female students (all wording addresses students in the feminine form) |
| Users | The teacher presents on a projector or smart board; students interact through the teacher (or by coming to the board) |
| Language | Arabic, full RTL |

## Features

- **Presentation player** (`presentation.html?lesson=u1l2`)
  - Fixed 1920×1080 (16:9) stage, scaled to fill any screen — never scrolls, never changes size between slides.
  - Large, high-contrast Arabic typography (Tajawal, with system fallbacks offline).
  - Smooth transitions (slide / fade / zoom) and staggered element entrances.
  - Thin progress bar, slide counter, auto-hiding control bar, shortcut hint.
  - Keyboard + mouse + touch (smart board) support.
- **Clapping 👏** — synthesized with the Web Audio API (no audio files) plus flying 👏 emojis. Only triggered manually (button or the ت key).
- **Name picker 🎲** — draws a random student from the selected class with a fast name-shuffle animation; never repeats until everyone has been picked (with a "restart" button). After a draw: **+1 point** and **Correct answer ✓** buttons save straight to that student's record.
- **Quizzes & interactions** — multiple choice, true/false, drag-and-drop sorting, drag-to-reorder, flip cards, click-to-reveal cards and steps, brainstorm idea board, think-pair-share with timer, cooperative group tasks with timer, one-minute challenge, live code editor previews (HTML/CSS/JS run in a sandboxed iframe).
  - Correct answer → confetti + success sound + «أحسنتِ! 👏 إجابة صحيحة».
  - Wrong answer → gentle shake + «حاولي مرة أخرى 💜».
  - Slides never advance automatically; the teacher is always in control.
- **Teacher dashboard** — teacher profile, classes (add / rename / delete), students (single or bulk paste, inline editing, points, correct answers, times picked, notes), completed lessons per class with dates, quick statistics, top students per class.
- **Local storage** — every change is saved automatically to `localStorage` with a «تم الحفظ ✓» toast; all reads/writes are wrapped in `try/catch` and fall back to in-memory mode if storage is blocked.
- **Excel export** — `.xlsx` via SheetJS (CDN) with a *Teacher info* sheet, one sheet per class, and a *Completed lessons* sheet (sheets are RTL). If offline, a UTF-8-with-BOM `.csv` is exported instead so Arabic displays correctly in Excel.
- **Backup / restore** — download all data as one JSON file and restore it on another device.
- **Clear all data** — with an in-page confirmation dialog (no `alert`).

## Folder & file structure

```
survey/
├── index.html            Home page: lesson library, class selector, welcome, ✔️ completed badges
├── presentation.html     Slide player shell (stage, control bar, picker dialog, effects layer)
├── dashboard.html        Teacher dashboard (5 tabs)
├── css/
│   └── style.css         All styles: design tokens, home, dashboard, player, every slide type
├── js/
│   ├── app.js            Player engine: slide renderers, navigation, keyboard, sounds, clapping,
│   │                     confetti, name picker, timers, drag & drop, code highlighting
│   ├── storage.js        `Store` module: localStorage persistence, classes/students/progress API,
│   │                     picker rotation, backup/restore, save toast
│   ├── dashboard.js      Dashboard logic (forms, tables, stats, confirm dialog, backup/export buttons)
│   └── export.js         `Exporter` module: .xlsx export via SheetJS, CSV fallback, file download
├── data/
│   └── lessons.js        ALL lesson content (5 units, 18 lessons) as a JavaScript variable
├── project-overview.md   This document
└── project-overiew.md    Original project brief (Arabic)
```

> `data/lessons.js` is a plain `<script>` (not JSON loaded with `fetch`), so the project works when opened directly from disk via `file://`.

## How to run

1. Keep the folder structure as is.
2. Double-click **`index.html`** (Chrome, Edge, Firefox or Safari).
3. That's it — no installation, no server, no internet required.
   - With internet: the Tajawal font and the SheetJS library load from CDNs.
   - Without internet: system Arabic fonts are used and Excel export falls back to CSV.

## How to use the dashboard

1. Open **⚙️ لوحة تحكم المعلمة** from the home page.
2. **👩‍🏫 Teacher info** — type your name, school, subject, grade, term and year. Saved as you type; shown on the home page and on every lesson's welcome slide.
3. **🏫 Classes & students**
   - Add a class (e.g. `٢/١`), click it to open its students.
   - Add one student, or expand *bulk add* and paste a list (one name per line; leading numbers/bullets are stripped).
   - Edit names and notes inline; use − / + to adjust points, correct answers and times picked; 🗑️ to delete (with confirmation).
4. **✔️ Lesson tracking** — choose class, lesson and date → *Register*. Lessons can also be registered from the closing slide of any presentation.
5. **📊 Statistics** — number of classes, total students, completed lessons, distinct lessons taught, and the top 5 students per class.
6. **💾 Export & backup**
   - *Export to Excel* → `بيانات-الفصول-YYYY-MM-DD.xlsx` (or `.csv` offline).
   - *Download backup* → JSON file with everything.
   - *Restore* → choose a backup JSON (replaces current data after confirmation).
   - *Clear all data* → permanent wipe after confirmation.

Then, on the home page, **select the class** before starting a lesson so the picker and points use that class's students.

## How to edit or add lesson content (`data/lessons.js`)

Each lesson is registered with `addLesson(unitId, lesson)`. The player builds the slides automatically; edit the file, save, and refresh the browser (F5).

```js
addLesson('u1', {
  id: 'u1l4',                 // unique id, used in the URL: presentation.html?lesson=u1l4
  title: 'عنوان الدرس',
  page: 64,                   // page number in the textbook
  slides: [
    { type: 'welcome', emoji: '📊' },
    { type: 'objectives', items: ['هدف أول', 'هدف **مهم** ثانٍ'] },
    { type: 'mcq',
      question: 'ما الذي…؟',
      options: ['خيار ١', 'خيار ٢', 'خيار ٣', 'خيار ٤'],
      answer: 2,               // 1-based: 2 = the second option
      explain: 'سبب الإجابة' },
    { type: 'tf', items: [
      { text: 'عبارة صحيحة', answer: 'صح' },
      { text: 'عبارة خاطئة', answer: 'خطأ', explain: 'التصحيح' }
    ] },
    { type: 'closing', title: 'أحسنتنّ!', message: 'رسالة تحفيزية' }
  ]
});
```

Text conventions inside any string:

- `**word**` → **bold**
- `\n` → new line
- Text is HTML-escaped, so writing `<b>` shows the tag literally (useful for HTML lessons).

To add a new unit, add an entry to `LESSONS_DATA.units` at the top of the file (`id`, `icon`, `title`, `subtitle`, `lessons: []`).

If the first slide is not `welcome` or the last is not `closing`, the player adds them automatically.

## Slide types reference

Common optional fields for **every** slide: `title`, `tag` (pill label above the title — defaults to the strategy name), `subtitle`, `transition` (`'slide' | 'fade' | 'zoom'`).

| Type | Purpose | Fields |
|---|---|---|
| `welcome` | Title slide; auto-fills unit, lesson, teacher, school, class, book page | `emoji`, `title?`, `subtitle?` |
| `warmup` | Name picker card + quick review / prior-knowledge questions | `questions: [{q, a}]` (or `question`, `answer`), `label?` |
| `objectives` | Numbered lesson objectives | `items: [string]` |
| `hook` | Opening question / scenario (تمهيد) | `emoji`, `story?`, `question?`, `answer?`, `revealLabel?` |
| `story` | Same layout, labelled "Story & real-life situation" | same as `hook` |
| `predict` | "What do you expect?" with reveal | same as `hook` |
| `points` | "Observe & discover" cards; optional click-to-reveal | `items: [{icon, title, text, hint?}]`, `cols?`, `reveal?: true` |
| `flip` | Cards that flip on click | `cards: [{icon, front, back}]`, `cols?` |
| `compare` | Comparison table, rows appear in sequence | `headers: []`, `rows: [[]]`, `note?` |
| `steps` | Numbered steps revealed one at a time | `items: []`, `reveal?: false` to show all |
| `code` | Syntax-highlighted code + live preview (hidden until "▶ Run" unless `hidePreview: false`) | `code`, `lang: 'html'│'css'│'js'`, `preview?`, `previewLabel?`, `codeSize?`, `note?`, `hidePreview?` |
| `brainstorm` | Central question; teacher types students' ideas as bubbles; "suggested idea" button | `question`, `ideas: []` |
| `tps` | Think–Pair–Share with three timed phases | `question`, `think`, `pair`, `share` (seconds), `answer?` |
| `coop` | Cooperative group tasks with a countdown | `groups: [{name, task, icon?}]`, `seconds` |
| `mcq` | Multiple choice with big lettered buttons | `question`, `options: []`, `answer` (1-based), `explain?` |
| `tf` | True / false list | `items: [{text, answer: 'صح'│'خطأ'│true│false, explain?}]` |
| `sort` | Drag-and-drop classification (mouse & touch) | `categories: []`, `items: [{text, cat}]` (`cat` must match a category exactly) |
| `order` | Drag to reorder, then "Check" | `items: []` in the **correct** order (shuffled automatically) |
| `challenge` | One-minute challenge: timer + questions with per-item reveal | `seconds`, `items: [{q, a}]` |
| `review` | Summary cards | `items: [{icon, title, text}]` |
| `closing` | Motivational ending; clap, mark lesson complete, next lesson | `emoji`, `title`, `message` |

Long lists (5+ steps/order items, 3+ co-op groups) automatically switch to a compact layout so slides never overflow.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `→` / `Space` / `Page Down` | Next slide (Space draws a name while the picker is open) |
| `←` / `Page Up` | Previous slide |
| `Home` / `End` | First / last slide |
| `ت` (or `T`) | Clap 👏 |
| `ق` (or `Q`) | Open / close the name picker 🎲 |
| `F` | Toggle full screen |
| `Esc` | Close the picker, otherwise return to the lesson library |

Shortcuts are ignored while typing in an input (e.g. the brainstorm box). Arrow keys, Space and the mouse wheel never scroll the page. The current slide number is kept in the URL hash (`#5`), so refreshing stays on the same slide.

## Data storage notes

- All data lives in the browser's `localStorage` under the key `dt2_classroom_v1` (typically ~5 MB available — far more than this app needs).
- Data is **per browser and per device**: another browser, another computer, or a private/incognito window will not see it. Clearing site data erases it.
- Use **Download backup** regularly and **Restore** to move to another device.
- If storage is blocked, the app keeps working in memory and warns the teacher; data is lost when the tab closes.
- Lesson content is **not** stored in the browser — it always comes from `data/lessons.js`.

## Learning strategies used

Strategies are varied across lessons (not every lesson uses all of them):

- Direct questioning and **instant assessment** (MCQ, true/false, sorting with immediate feedback)
- **Think – Pair – Share** with phase timers
- **Brainstorming** with a live idea board
- **Cooperative learning** (group task cards + timer)
- **True or False**, **Choose the correct answer**
- **What do you expect?** (prediction before reveal, and "predict the output" before running code)
- **Observe & discover** (click-to-reveal cards, flip cards, comparison tables)
- **One-minute challenge**
- **Story & real-life situations** connected to students' lives (Riyadh Season, a cupcake project, school clubs, national events, Vision 2030)
- **Drag-and-drop classification and ordering**
- **Live coding** with instant browser preview (Unit 5)
- Name picker + participation points for fair, motivating participation

## Units & lessons map (from the book)

Every lesson starts with a welcome slide, a warm-up (picker + review of the previous lesson, or prior-knowledge questions for the first lesson), objectives, a hook, interactive explanation slides, brainstorm / think-pair-share / co-op, several varied questions, true/false, a one-minute challenge, review, and a motivational closing.

| Unit | Lesson | ID | Book page |
|---|---|---|---|
| **1 — Data Science** (علم البيانات) | Data, Information & Knowledge | `u1l1` | 11 |
| | Data Collection & Validation | `u1l2` | 25 |
| | Forecasting & Encryption in Excel | `u1l3` | 45 |
| **2 — Artificial Intelligence** (الذكاء الاصطناعي) | AI Concepts | `u2l1` | 65 |
| | AI Applications (Machine Learning for Kids) | `u2l2` | 75 |
| | AI with Programming (Scratch) | `u2l3` | 87 |
| **3 — Graphic Design** (التصميم الرسومي) | Graphic Design | `u3l1` | 97 |
| | Designing an Advertising Poster (Inkscape) | `u3l2` | 117 |
| | Animated Advertisements (Inkscape + GIMP) | `u3l3` | 134 |
| **4 — E-Marketing** (التسويق الإلكتروني) | E-Marketing Concepts | `u4l1` | 151 |
| | Email Marketing (Mailchimp) | `u4l2` | 165 |
| | Email Marketing Campaign | `u4l3` | 181 |
| **5 — Advanced Programming with HTML** (البرمجة المتقدمة) | Formatting with HTML Tags | `u5l1` | 205 |
| | Cascading Style Sheets (CSS) | `u5l2` | 213 |
| | Website Design | `u5l3` | 232 |
| | Responsive Web Design | `u5l4` | 252 |
| | Interactive Website (JavaScript & SEO) | `u5l5` | 275 |
| | Digital Newsletters | `u5l6` | 301 |

The book's end-of-book self-test section (اختبر نفسك, pp. 318–330) is not a lesson and is not converted.

## Possible future improvements

- Teacher-facing **in-browser lesson editor** (add/edit slides without touching `lessons.js`).
- **Student response mode**: students answer on their own devices (would require a small backend or WebRTC).
- **Team scoreboard** for group competitions across a lesson.
- Per-question analytics (which questions were hardest per class).
- **Print/PDF handouts** generated from each lesson's review slide.
- Bundling the font and SheetJS locally for 100 % offline `.xlsx` export.
- Optional speaker notes view on a second screen.
- Dark "low-light" presentation theme for bright classrooms.
