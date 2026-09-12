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

### Deploying under a subfolder

The build uses **relative** asset paths (`base: './'` in `vite.config.js`), so you can
drop the contents of `dist/` into any subdirectory of your web server (e.g.
`https://example.com/my-app/`) without further configuration.


## Usage

1. Fill in **Board**: the full URL (`https://trello.com/b/xxxx/my-board`) or the board ID.
2. Fill in **Token** (and optionally the **API key**).
3. Click **Show Gantt**.

You can **save** the board + token + API key under a **name** as a profile. Profiles are
stored in your browser's `localStorage`, listed in the dropdown, and the last one used is
restored (and reloaded) automatically on the next visit.

A **Demo** button shows a fictional dataset — no Trello account required.

### Archived cards & filter

Both active and **archived** cards are fetched, and a footer filter lets you show
**Du tableau** (active only), **Archivées** (archived only) or **Les deux** (both). The
choice is remembered in `localStorage`. Archived rows render faded and always end at their
last event (no "ongoing" stamp edge).

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
| **Task** | Card (linked to `https://trello.com/c/<shortLink>`) | Row + bar on the timeline |
| **Start date** | `start` if set, otherwise **creation date** (derived from the card ID) | Bar origin |
| **End date** | **Done** (archived or in the last column): last event / due date. **Not done**: bar extends **to today** (or to the due date if overdue) | Bar end |
| **Steps** | **Column changes** (board actions `updateCard:idList`) | Time-proportional segments inside the bar, colored by column |
| **Current column** | The column the card is in now (open task) | Hatched last segment |
| **Revisit** | Card moved back to a column it already left | Cross-hatched segment (yellow) |
| **Members** | Card assignments | Avatars (image or initials) |
| **Due date** | `due` | Black diamond |
| **Today** | — | Red vertical line |

> Steps come from the card's **movement history** (not checklists), so they reflect the
> real time spent in each column. History is read from the board's actions API
> (up to ~2000 recent moves); very old moves may be truncated.

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
