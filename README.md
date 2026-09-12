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
2. Fill in the **API key**, click **🔗 Autoriser l'application**, and approve on Trello — the
   user token is captured and saved automatically (no token field to fill by hand).
3. Click **Show Gantt**.

You can **save** the board + token + API key under a **name** as a profile. Profiles are
stored in your browser's `localStorage`, listed in the dropdown, and the last one used is
restored (and reloaded) automatically on the next visit.

A **Demo** button shows a fictional dataset — no Trello account required.

### Getting the API key and the token

Trello's admin panel (*trello.com/power-ups/admin* → **API key** tab) shows two fields,
**Key** and **Secret**. That pair is *not* what the REST API accepts for a plain request.
There are two separate mechanisms in Trello's docs:

| Mechanism | Credentials | Used by this app |
| --- | --- | --- |
| **Legacy token auth** ([docs](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/)) | `key=` + `token=` query params, where `token` is a **user token** from `1/authorize` | ✅ yes |
| **OAuth 1.0a** (same page, "Using Basic OAuth") | key + **application secret**, HMAC-signed requests | ❌ no |
| **OAuth 2.0 (3LO)** ([RFC-89](https://community.developer.atlassian.com/t/rfc-89-introducing-oauth2-to-trello/90359), replacing the above) | client id + secret, auth-code + PKCE, `Authorization: Bearer` | ❌ no |

The doc's own example for the mechanism this app uses:

```
curl https://api.trello.com/1/members/me?key={{apiKey}}&token={{apiToken}}
```

So the **secret is not a substitute for the token** — sending it as `token=` returns
`401 invalid token`. It is only needed to sign OAuth requests and to verify webhook
callbacks, neither of which a browser-only app can do.

1. Create a Power-Up at <https://trello.com/power-ups/admin> → **API key** tab, and copy the
   field labelled **« Clé d'API » / "API key"**.
2. In that same tab, add this app's address (e.g. `http://localhost:5173`, or your deployed
   domain) under **« Origines autorisées » / "Allowed origins"** — otherwise Trello blocks the
   token redirect.
3. Click **🔑 Obtenir le token** in the app, press **Allow / Autoriser** on the Trello page, and
   the **user token** is filled in automatically. (Manual fallback: open
   `https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_KEY`
   and copy the token shown.)

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
