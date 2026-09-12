# Gantt from Trello

A React web app that turns a **Trello** board into a **Gantt chart**, with each task's
steps shown in color, a legend, and member avatars.

> **Note:** this project is 100% *vibe coding* — built by prompting an AI assistant and
> iterating on the result, not hand-written line by line. It's a quick, working demo, not
> a hardened production codebase.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Dependencies: **react / react-dom** (UI), **html2canvas** + **jspdf** (export PNG/PDF,
lazy-loaded only when you click an export button), **vite** (build). `npm install` pulls
everything from `package-lock.json`.

Production build:

```bash
npm run build
npm run preview
```

Or use the provided `Makefile`:

```bash
make dev         # install deps if needed (re-runs on package.json / lock change) + dev server
make install     # install dependencies only
make build       # production build into dist/
make preview     # preview the build
```

### Deploying under a subfolder

The build uses **relative** asset paths (`base: './'` in `vite.config.js`), so you can
drop the contents of `dist/` into any subdirectory of your web server (e.g.
`https://example.com/my-app/`) without further configuration. The web manifest, service
worker and icons are all registered with relative paths, so PWA install also works from a
subfolder.

### Installable PWA (macOS, iOS, Android, desktop)

The app ships a web manifest (`public/manifest.webmanifest`), icons (`public/icons/`,
generated from `favicon.svg`) and an offline service worker (`public/sw.js`). Name shown
on install: **Gantt Trello**. Service workers require a **secure context** — `localhost`
counts, but a plain `http://` LAN address does not (use `https://` or `localhost`).

- **macOS (Safari)** — *File ▸ Add to Dock…* (or *Share ▸ Add to Home Screen* on iOS).
  The window then opens as a standalone app named *Gantt Trello* with its own Dock icon.
- **macOS / Windows / Linux (Chrome or Edge)** — the **install** icon in the address bar
  (or the ⋮ menu → *Install app…*); it lands on the desktop / Start menu / Applications.
- **Android (Chrome)** — ⋮ → *Add to Home screen*.

To regenerate the PNG icons after editing `public/favicon.svg`:

```bash
magick -background '#0b3d91' public/favicon.svg -resize 180x180 -flatten public/icons/apple-touch-icon.png
magick -background '#0b3d91' public/favicon.svg -resize 192x192 -flatten public/icons/icon-192.png
magick -background '#0b3d91' public/favicon.svg -resize 512x512 -flatten public/icons/icon-512.png
magick -background '#0b3d91' public/favicon.svg -resize 512x512 -flatten public/icons/maskable-512.png
```


## Usage

The header is laid out in three rows:

1. **Title** on the left, **❓ help** and **🌙/☀️ theme** on the right.
2. **Profile** management on the left (dropdown + **＋** new / **✎** rename / **🗑** delete),
   **⚙️ Connexion Trello** on the right.
3. **Afficher le Gantt** (enabled only once a profile is selected *and* a token is set) and
   **Démo**.

Steps:

1. Click **＋** and name a new profile in the popup (or pick an existing one in the dropdown;
   **Aucun** resets the form).
2. Open **⚙️ Connexion Trello** and fill Board URL/ID, Token, optional API key.
3. Click **Afficher le Gantt**.

Profiles, board and credentials live in your browser's `localStorage`; the last profile used
is restored (and reloaded) automatically on the next visit.

A **Démo** button shows a fictional dataset — no Trello account required.

### Archived cards & filter

Both active and **archived** cards are fetched, and a footer filter lets you show
**Du tableau** (active only), **Archivées** (archived only) or **Les deux** (both). The
choice is remembered in `localStorage`. Archived rows render faded and always end at their
last event (no "ongoing" stamp edge).

### Period & tag filters

- **Search**: a free-text box matches the task **title** (case- and
  accent-insensitive: "echeance" finds *Échéance*).
- **Period**: two date inputs (*Du … au …*, each bound optional), plus one-click presets
  **Semaine / Mois / Trimestre**. Tasks that did not exist during the period (no overlap
  between their bar and the range) are hidden — a lighter board. **✕ Réinitialiser**
  returns to the full view. Remembered in `localStorage`.
- **Tags**: a dropdown (**🏷️**) with a search box and color swatches, multi-select with
  OR logic — it scales to boards with many labels. The trigger shows the selection and
  clears it with **✕**.

All four filters (card state, search, period, tags) combine.

### Light / dark theme

A **🌙 / ☀️** button in the header toggles day/night. The choice is remembered in
`localStorage`; on first visit it follows the OS `prefers-color-scheme`. All colors run
through CSS variables (`:root` = light, `[data-theme='dark']` = dark), and PNG/PDF exports
use the current theme's background.

### Reading the timeline

- **Weekends** (Sat + Sun) are shaded gray across the timeline.
- **Minimap**: a bird's-eye view of all bars above the chart; click or drag the highlight
  to navigate.
- **Density**: the **⇲ Compact** button shrinks row height for long lists.
- **Hover stats**: hovering a task's **title** shows a tooltip with its total duration in
  days, the **% split across columns** (steps), the number of **due-date pushes**, and the
  number of **back-to-earlier-column** moves.

### Summary

Under the chart, a summary shows the **cumulative days per column (step)** for the
currently displayed tasks — clipped to the selected period when one is set — as a
proportional stacked bar plus a list (`column: N days · M tasks`).

### Export

Three buttons in the footer export the **currently displayed** tasks (filters applied):

- **🖼️ PNG** — full chart as an image (off-screen content included, not just the visible
  part).
- **📄 PDF** — landscape, multi-page if the chart is taller than a page.
- **📋 CSV** — one row per task (title, column, dates, status, tags, members, link).

PNG/PDF use `html2canvas` + `jspdf`, **lazy-loaded** only when clicked (they stay out of
the initial bundle). Known limitation: `html2canvas` doesn't render the CSS `mask` used
for the "ongoing" stamp edge, so those bars export with a plain (non-notched) end; remote
Trello avatars may be skipped if their CORS headers block the canvas.

### Getting the API key and token

1. Create a Power-Up and copy its **API key** at
   <https://trello.com/power-ups/admin> (the *API key* tab — copy **Clé d'API**, *not*
   *Secret*). Add this app's address (e.g. `http://localhost:5173` or your domain) under
   **Origines autorisées** so Trello may redirect back.
2. In **⚙️ Connexion Trello**, paste the key and click **🔑**: a Trello authorization popup
   opens (read-only, never expires); press **Allow** and the token is captured automatically
   (via `postMessage`, with a URL-fragment fallback).
3. Manual fallback if you prefer: open
   `https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_KEY`
   and paste the token shown.

Credentials are stored only in your browser's `localStorage` and sent directly to the
Trello API — there is no intermediary server.

> ⚠️ The token is saved in **plain text** in `localStorage`. Only use this on a trusted
> machine, and prefer a read-only token.

## How it maps

| Element | Trello source | Rendering |
| --- | --- | --- |
| **Task** | Card (linked to `https://trello.com/c/<shortLink>`) | Row + bar on the timeline |
| **Start date** | `start` if set, otherwise **creation date** (derived from the card ID) | Bar origin |
| **End date** | **Done** (archived or in the last column): date of the **last step** — or the **archiving date** if it never reached the last column (never the due date). **Not done**: bar extends **to today** (or to the due date if overdue) | Bar end |
| **Steps** | **Column changes** (board actions `updateCard:idList`) | Time-proportional segments inside the bar, colored by column |
| **Current column** | The column the card is in now (open task) | Hatched last segment |
| **Revisit** | Card moved back to a column it already left | Cross-hatched segment (yellow) |
| **Members** | Card assignments | Avatars (image or initials) |
| **Tags (labels)** | Card labels (`idLabels` + board `labels`) | Colored chips under the task name; a searchable multi-select dropdown in the footer filters rows by tag (OR logic) |
| **Due-date history** | Board actions `updateCard:due` / `dueChanged` (`data.old.due`) | Gray diamonds for each deadline that was pushed back |
| **Back arrow** | Card moved backwards in the column flow | ◀ marker on the segment (toggle in the toolbar, on by default) |
| **Due date** | `due` | Black diamond |
| **Today** | — | Red vertical line |

> Steps come from the card's **movement history** (not checklists), so they reflect the
> real time spent in each column. History is read from the board's actions API
> (up to ~2000 recent moves); very old moves may be truncated.

## Structure

```
src/
  trelloApi.js      Trello API client (ID extraction, requests)
  ganttModel.js     Trello data -> Gantt model
  GanttChart.jsx    timeline component (bars, steps, avatars, zoom, minimap)
  Legend.jsx        legend (lists + step statuses + markers)
  Avatars.jsx       avatars / avatar stack
  TagSelect.jsx     searchable multi-select dropdown for tag filters
  exportImage.js    PNG / PDF export (html2canvas + jspdf, lazy-loaded)
  demoData.js       demo dataset
  App.jsx           form, profiles, filters + orchestration
  styles.css        styles
```

> Note: the Trello API accepts cross-origin GET requests from a browser, so no extra
> configuration is needed to run the app locally. (A key's "Allowed origins" only affect
> the authorization flow's redirects, not the API calls themselves.)

### Zoom

Besides the zoom slider, you can zoom directly on the timeline with the **mouse wheel /
trackpad pinch while holding Ctrl (⌘ on Mac)**. The scale stays anchored on the date under
the cursor. A plain wheel (no modifier) still scrolls normally.
