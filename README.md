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

Production build:

```bash
npm run build
npm run preview
```

Or use the provided `Makefile`:

```bash
make dev         # install deps if needed + run dev server
make build       # production build into dist/
make preview     # preview the build
```

## Usage

1. Fill in **Board**: the full URL (`https://trello.com/b/xxxx/my-board`) or the board ID.
2. Fill in **Token** (and optionally the **API key**).
3. Click **Show Gantt**.

You can **save** the board + token + API key under a **name** as a profile. Profiles are
stored in your browser's `localStorage`, listed in the dropdown, and the last one used is
restored (and reloaded) automatically on the next visit.

A **Demo** button shows a fictional dataset — no Trello account required.

### Getting a token

1. Create an API key at <https://trello.com/power-ups/admin>.
2. Generate a read-only token via:
   `https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_KEY`
3. Copy the token shown.

Credentials are stored only in your browser's `localStorage` and sent directly to the
Trello API — there is no intermediary server.

> ⚠️ The token is saved in **plain text** in `localStorage`. Only use this on a trusted
> machine, and prefer a read-only token.

## How it maps

| Element | Trello source | Rendering |
| --- | --- | --- |
| **Task** | Card | Row + bar on the timeline |
| **Start date** | `start` if set, otherwise **creation date** (derived from the card ID) | Bar origin |
| **End date** | Due date (`due`); if none, a short bar | Bar end |
| **Step (overall)** | List / column | Row dot + color (legend "Lists") |
| **Sub-steps** | Checklist items | Colored segments inside the bar (legend "Sub-steps") |
| **Members** | Card assignments | Avatars (image or initials) |
| **Due date** | `due` | Black diamond |
| **Today** | — | Red vertical line |

Sub-step colors: **green** = done, **yellow** = to do, **orange** = in progress.

## Structure

```
src/
  trelloApi.js     Trello API client (ID extraction, requests)
  ganttModel.js    Trello data -> Gantt model
  GanttChart.jsx   timeline component (bars, steps, avatars, zoom)
  Legend.jsx       legend (lists + step statuses + markers)
  Avatars.jsx      avatars / avatar stack
  demoData.js      demo dataset
  App.jsx          form, profiles + orchestration
  styles.css       styles
```

> Note: the Trello API accepts cross-origin GET requests from a browser, so no extra
> configuration is needed to run the app locally. (A key's "Allowed origins" only affect
> the authorization flow's redirects, not the API calls themselves.)
