import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBoardData } from './trelloApi.js';
import { buildGanttModel } from './ganttModel.js';
import GanttChart from './GanttChart.jsx';
import Legend from './Legend.jsx';
import { getDemoData } from './demoData.js';

const LS_PROFILES = 'gantt-trello-profiles';
const LS_LAST = 'gantt-trello-last-profile';
const LS_FILTER = 'gantt-trello-card-filter';
const LS_PERIOD = 'gantt-trello-period';

const CARD_FILTERS = {
  board: 'Du tableau',
  archived: 'Archivées',
  both: 'Les deux',
};

/** Applique le filtre cartes actives / archivées aux lignes du modèle. */
function filterRows(rows, filter) {
  if (filter === 'board') return rows.filter((r) => !r.closed);
  if (filter === 'archived') return rows.filter((r) => r.closed);
  return rows;
}

/** "2026-09-01" -> Date locale (minuit) ; null si vide/valide. */
function parseDateInput(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Filtre par période : ne garde que les tâches qui « existaient » à un moment
 * de la période choisie (recouvrement [start, end] ∩ [from, to]).
 * Les bornes absentes sont ouvertes.
 */
function filterRowsByPeriod(rows, from, to) {
  const f = parseDateInput(from);
  const t = parseDateInput(to);
  if (!f && !t) return rows;
  const tEnd = t ? new Date(t.getTime() + 24 * 3600 * 1000) : null; // exclusif
  return rows.filter((r) => {
    if (tEnd && r.start >= tEnd) return false; // tâche commencée après la période
    if (f && r.end < f) return false; // tâche terminée avant la période
    return true;
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Charge les profils enregistrés (nom + tableau + token + clé d'API). */
function loadProfiles() {
  try {
    const raw = localStorage.getItem(LS_PROFILES);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.filter((p) => p && p.id && p.name);
    }
    // Migration depuis l'ancien format (config unique, sans nom)
    const legacy = localStorage.getItem('gantt-trello-config');
    if (legacy) {
      const p = JSON.parse(legacy);
      if (p && p.board && p.token) {
        const profile = {
          id: uid(),
          name: 'Mon tableau',
          board: p.board,
          token: p.token,
          apiKey: p.apiKey || '',
          updatedAt: new Date().toISOString(),
        };
        const migrated = [profile];
        localStorage.setItem(LS_PROFILES, JSON.stringify(migrated));
        localStorage.setItem(LS_LAST, profile.id);
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles) {
  try {
    localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
  } catch {
    /* stockage plein ou indisponible */
  }
}

export default function App() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(LS_LAST) || '');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [board, setBoard] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [cardFilter, setCardFilter] = useState(
    () => localStorage.getItem(LS_FILTER) || 'both'
  );
  // Période optionnelle { from, to } en format "YYYY-MM-DD" (vide = tout).
  const [period, setPeriod] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PERIOD) || 'null');
      if (p && (p.from || p.to)) return { from: p.from || '', to: p.to || '' };
    } catch {
      /* ignore */
    }
    return { from: '', to: '' };
  });

  // Évite l'auto-chargement lors du parcours des champs depuis les profils
  const firstRender = useRef(true);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId]
  );

  // Lignes filtrées (actives / archivées / les deux) + compteurs pour le filtre.
  const counts = useMemo(() => {
    if (!model) return { open: 0, closed: 0 };
    const closed = model.rows.filter((r) => r.closed).length;
    return { open: model.rows.length - closed, closed };
  }, [model]);

  const filteredModel = useMemo(() => {
    if (!model) return null;
    let rows = filterRows(model.rows, cardFilter);
    rows = filterRowsByPeriod(rows, period.from, period.to);
    return { ...model, rows };
  }, [model, cardFilter, period]);

  const periodActive = !!(period.from || period.to);

  const setPeriodPart = (key, value) => {
    setPeriod((p) => {
      const next = { ...p, [key]: value };
      if (next.from || next.to) localStorage.setItem(LS_PERIOD, JSON.stringify(next));
      else localStorage.removeItem(LS_PERIOD);
      return next;
    });
  };

  const resetPeriod = () => {
    localStorage.removeItem(LS_PERIOD);
    setPeriod({ from: '', to: '' });
  };

  const applyRaw = (raw) => {
    setModel(buildGanttModel(raw));
    setLastLoaded(new Date());
  };

  const persistProfiles = useCallback((next) => {
    setProfiles(next);
    saveProfiles(next);
  }, []);

  /** Enregistre (ou met à jour) le profil courant sous « name ». */
  const saveProfile = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Donnez un nom au profil avant d’enregistrer (ex : « Projet Alpha »).');
      return;
    }
    if (!board.trim()) {
      setError('Renseignez l’URL ou l’ID du tableau avant d’enregistrer.');
      return;
    }
    const existing = profiles.find((p) => p.id === selectedId);
    const profile = {
      id: existing ? existing.id : uid(),
      name: trimmedName,
      board: board.trim(),
      token: token.trim(),
      apiKey: apiKey.trim(),
      updatedAt: new Date().toISOString(),
    };
    const next = existing
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];
    persistProfiles(next);
    setSelectedId(profile.id);
    localStorage.setItem(LS_LAST, profile.id);
    setError(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }, [name, board, token, apiKey, profiles, selectedId, persistProfiles]);

  /** Charge un profil enregistré dans le formulaire. */
  const selectProfile = useCallback(
    (id) => {
      const p = profiles.find((x) => x.id === id);
      if (!p) return;
      setSelectedId(id);
      localStorage.setItem(LS_LAST, id);
      setName(p.name);
      setBoard(p.board || '');
      setToken(p.token || '');
      setApiKey(p.apiKey || '');
      setError(null);
    },
    [profiles]
  );

  const deleteProfile = useCallback(() => {
    if (!selectedId) return;
    if (!window.confirm(`Supprimer le profil « ${name} » de ce navigateur ?`)) return;
    const next = profiles.filter((p) => p.id !== selectedId);
    persistProfiles(next);
    setSelectedId('');
    localStorage.removeItem(LS_LAST);
    setName('');
    setBoard('');
    setToken('');
    setApiKey('');
    setModel(null);
  }, [profiles, selectedId, name, persistProfiles]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchBoardData(board, token, apiKey);
      applyRaw(raw);
      // Si un profil existe déjà avec le même nom, on le met à jour automatiquement
      if (name.trim() && board.trim()) {
        const existing = profiles.find((p) => p.id === selectedId);
        const profile = {
          id: existing ? existing.id : uid(),
          name: name.trim(),
          board: board.trim(),
          token: token.trim(),
          apiKey: apiKey.trim(),
          updatedAt: new Date().toISOString(),
        };
        const next = existing
          ? profiles.map((p) => (p.id === profile.id ? profile : p))
          : [...profiles, profile];
        persistProfiles(next);
        setSelectedId(profile.id);
        localStorage.setItem(LS_LAST, profile.id);
      }
    } catch (e) {
      setError(e.message || String(e));
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [board, token, apiKey, name, profiles, selectedId, persistProfiles]);

  const loadDemo = useCallback(() => {
    setError(null);
    applyRaw(getDemoData());
  }, []);

  // Au premier rendu : pré-charge le dernier profil et lance le chargement
  useEffect(() => {
    if (!firstRender.current) return;
    firstRender.current = false;
    const saved = loadProfiles();
    const lastId = localStorage.getItem(LS_LAST);
    const p = saved.find((x) => x.id === lastId);
    if (p) {
      setSelectedId(p.id);
      setName(p.name);
      setBoard(p.board || '');
      setToken(p.token || '');
      setApiKey(p.apiKey || '');
      if (p.token && p.board) {
        fetchBoardData(p.board, p.token, p.apiKey || '')
          .then((raw) => {
            applyRaw(raw);
          })
          .catch((e) => setError(e.message || String(e)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo">▦</span>
          <div>
            <h1>Gantt depuis Trello</h1>
            <p>Visualisez les tâches et leurs étapes sur une timeline.</p>
          </div>
        </div>
        <form
          className="app__form"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <div className="app__profiles">
            <label className="app__field app__field--select">
              <span>Profil enregistré</span>
              <select
                value={selectedId}
                onChange={(e) => selectProfile(e.target.value)}
              >
                <option value="">— Nouveau / non enregistré —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="app__field app__field--name">
              <span>Nom du profil</span>
              <input
                type="text"
                placeholder="ex : Projet Alpha"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="app__profile-actions">
              <button
                className="app__save"
                type="button"
                onClick={saveProfile}
                disabled={loading}
                title="Enregistrer ce profil dans ce navigateur (localStorage)"
              >
                {savedFlash ? '✓ Enregistré' : selectedProfile ? 'Mettre à jour' : 'Enregistrer'}
              </button>
              {selectedProfile && (
                <button
                  className="app__delete"
                  type="button"
                  onClick={deleteProfile}
                  disabled={loading}
                  title="Supprimer ce profil de ce navigateur"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
          <label className="app__field app__field--board">
            <span>Tableau (URL ou ID)</span>
            <input
              type="text"
              placeholder="https://trello.com/b/xxxx/mon-tableau"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="app__field">
            <span>Token</span>
            <input
              type="password"
              placeholder="token API Trello"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="app__field">
            <span>
              Clé d'API <em>(optionnelle)</em>
            </span>
            <input
              type="text"
              placeholder="clé d'API du Power-Up"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button className="app__submit" type="submit" disabled={loading}>
            {loading ? 'Chargement…' : 'Afficher le Gantt'}
          </button>
          <button className="app__demo" type="button" onClick={loadDemo} disabled={loading}>
            Démo
          </button>
        </form>
      </header>

      <div className="app__hint">
        <strong>Profils :</strong> nommez, enregistrez et retrouvez vos tableaux (avec token et clé
        d'API) directement dans ce navigateur (localStorage). Le dernier profil utilisé est
        rechargé automatiquement à l'ouverture, et « Afficher le Gantt » met à jour le profil
        sélectionné. Attention : le token est enregistré en clair dans ce navigateur — ne l'utilisez
        que sur un poste de confiance.
      </div>

      <div className="app__hint">
        <strong>Comment obtenir un token ?</strong> Créez une clé d'API sur{' '}
        <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">
          trello.com/power-ups/admin
        </a>
        , puis générez un token en lecture seule via l'URL{' '}
        <code>
          https://trello.com/1/authorize?expiration=never&amp;scope=read&amp;response_type=token&amp;key=VOTRE_CLE
        </code>
        . Les identifiants sont stockés uniquement dans votre navigateur et transmis directement à
        l'API Trello. Vous pouvez aussi cliquer sur <strong>Démo</strong> pour voir un exemple sans
        compte.
      </div>

      <div className="app__hint">
        <strong>Lecture des dates :</strong> la date de <strong>début</strong> d'une tâche correspond
        à sa date de début Trello si elle existe, sinon à sa <strong>date de création</strong>. Une
        tâche <strong>non terminée</strong> (ni archivée, ni dans la dernière colonne) se prolonge
        jusqu'à <strong>aujourd'hui</strong>. Les <strong>étapes</strong> correspondent aux
        <strong> changements de colonne</strong> de la carte (historique Trello) : chaque segment
        coloré représente le temps passé dans une colonne, le dernier segment hachuré est la colonne
        actuelle. Cliquez sur le nom d'une tâche pour l'ouvrir dans Trello.
      </div>

      {error && (
        <div className="app__error" role="alert">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {model && (
        <>
          <Legend lists={model.lists} />
          <GanttChart model={filteredModel} />
          <footer className="app__footer">
            <div className="app__filter" role="group" aria-label="Filtre des cartes">
              {Object.entries(CARD_FILTERS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`app__filter-btn${cardFilter === key ? ' app__filter-btn--active' : ''}`}
                  onClick={() => {
                    setCardFilter(key);
                    localStorage.setItem(LS_FILTER, key);
                  }}
                >
                  {label}
                  <span className="app__filter-count">
                    {key === 'board'
                      ? counts.open
                      : key === 'archived'
                        ? counts.closed
                        : model.rows.length}
                  </span>
                </button>
              ))}
            </div>
            <div className="app__period" role="group" aria-label="Filtre par période">
              <label>
                Du
                <input
                  type="date"
                  value={period.from}
                  max={period.to || undefined}
                  onChange={(e) => setPeriodPart('from', e.target.value)}
                />
              </label>
              <label>
                au
                <input
                  type="date"
                  value={period.to}
                  min={period.from || undefined}
                  onChange={(e) => setPeriodPart('to', e.target.value)}
                />
              </label>
              {periodActive && (
                <button type="button" className="app__period-reset" onClick={resetPeriod}>
                  ✕ Réinitialiser
                </button>
              )}
            </div>
            {filteredModel.rows.length} tâche(s) affichée(s) sur {model.rows.length}{' '}
            {lastLoaded ? `· chargées le ${lastLoaded.toLocaleString('fr-FR')}` : ''}
            <button className="app__refresh" onClick={load} disabled={loading}>
              Actualiser
            </button>
          </footer>
        </>
      )}

      {!model && !error && !loading && (
        <div className="app__placeholder">
          Renseignez l'URL de votre tableau et votre token ci-dessus, puis cliquez sur « Afficher le
          Gantt » — ou sur « Démo » pour un exemple.
        </div>
      )}
    </div>
  );
}
