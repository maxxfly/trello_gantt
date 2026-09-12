import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBoardData } from './trelloApi.js';
import { buildGanttModel } from './ganttModel.js';
import GanttChart from './GanttChart.jsx';
import Legend from './Legend.jsx';
import { getDemoData } from './demoData.js';

const LS_PROFILES = 'gantt-trello-profiles';
const LS_LAST = 'gantt-trello-last-profile';

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

  // Évite l'auto-chargement lors du parcours des champs depuis les profils
  const firstRender = useRef(true);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId]
  );

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

  /**
   * Ouvre la page d'autorisation Trello dans une popup et récupère automatiquement
   * le token utilisateur renvoyé en fragment (#token=...) sur return_url.
   * ⚠️ Nécessite que l'origine de l'app figure dans « Origines autorisées » du
   * Power-Up (trello.com/power-ups/admin → Clé d'API). Sinon, utiliser le lien manuel.
   */
  const requestToken = useCallback(() => {
    const key = apiKey.trim();
    if (!key) {
      setError(
        "Saisissez d'abord la « Clé d'API » (champ « Clé d'API » de trello.com/power-ups/admin — PAS le « Secret »), puis recliquez sur « Obtenir le token »."
      );
      return;
    }
    setError(null);
    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const url =
      'https://trello.com/1/authorize?expiration=never&scope=read&response_type=token' +
      `&key=${encodeURIComponent(key)}` +
      `&return_url=${encodeURIComponent(returnUrl)}&callback_method=fragment`;
    const popup = window.open(url, 'trello-authorize', 'popup=yes,width=640,height=720');
    if (!popup) {
      // Popup bloquée : ouvrir dans un onglet, l'utilisateur copiera le token lui-même
      window.open(url, '_blank', 'noopener');
      return;
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        return;
      }
      let href = '';
      try {
        href = popup.location.href; // lisible seulement une fois revenu sur notre origine
      } catch {
        return; // encore sur trello.com, on attend
      }
      const match = href.match(/[#&]token=([^&]+)/);
      if (match) {
        clearInterval(timer);
        try {
          popup.close();
        } catch {
          /* déjà fermée */
        }
        setToken(decodeURIComponent(match[1]));
      }
    }, 300);
  }, [apiKey]);

  // Au premier rendu : pré-charge le dernier profil et lance le chargement
  useEffect(() => {
    if (!firstRender.current) return;
    firstRender.current = false;
    // Si la page d'autorisation Trello a redirigé cette fenêtre (#token=...), on récupère le token
    const hash = window.location.hash;
    const tokenMatch = hash.match(/[#&]token=([^&]+)/);
    if (tokenMatch) {
      setToken(decodeURIComponent(tokenMatch[1]));
      // Nettoie l'URL (le token ne doit pas rester dans l'historique)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
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
            <span>
              Token utilisateur Trello <em>(≠ le « Secret » du Power-Up)</em>
            </span>
            <input
              type="password"
              placeholder="collez ici le token renvoyé par trello.com/1/authorize"
              title="Le token utilisateur obtenu via la page d'autorisation Trello (bouton « Obtenir le token »). Le « Secret » affiché dans power-ups/admin ne fonctionne PAS ici."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="app__field">
            <span>
              Clé d'API <em>(champ « Clé d'API », pas « Secret »)</em>
            </span>
            <input
              type="text"
              placeholder="ex : 99006a4b49f5…"
              title="Onglet « Clé d'API » de trello.com/power-ups/admin : copiez la valeur de « Clé d'API » (et non celle de « Secret »)."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button
            className="app__token"
            type="button"
            onClick={requestToken}
            disabled={loading}
            title="Ouvre trello.com/1/authorize et récupère le token automatiquement. Requis : ajouter l'adresse de cette app dans « Origines autorisées » du Power-Up."
          >
            🔑 Obtenir le token
          </button>
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
        <strong>Comment obtenir la clé et le token ?</strong>
        <ol className="app__steps">
          <li>
            Sur{' '}
            <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">
              trello.com/power-ups/admin
            </a>
            , ouvrez votre Power-Up → onglet « Clé d'API » : copiez la valeur du champ{' '}
            <strong>« Clé d'API »</strong> (le champ <strong>« Secret » ne sert pas ici</strong> —
            il est réservé à OAuth et aux webhooks).
          </li>
          <li>
            Dans ce même onglet, ajoutez l'adresse de cette application (ex.{' '}
            <code>http://localhost:5173</code> ou votre domaine) dans «{' '}
            <strong>Origines autorisées</strong> » — sinon Trello refusera la redirection.
          </li>
          <li>
            Cliquez sur <strong>🔑 Obtenir le token</strong> : une page Trello s'ouvre, cliquez{' '}
            <strong>« Autoriser »</strong> et le <strong>token utilisateur</strong> sera rempli
            automatiquement. (Sinon, ouvrez manuellement{' '}
            <code>
              https://trello.com/1/authorize?expiration=never&amp;scope=read&amp;response_type=token&amp;key=VOTRE_CLE
            </code>{' '}
            et copiez le token affiché.)
          </li>
        </ol>
        <p>
          Les identifiants sont stockés uniquement dans votre navigateur et transmis directement à
          l'API Trello. Vous pouvez aussi cliquer sur <strong>Démo</strong> pour voir un exemple sans
          compte.
        </p>
      </div>

      <div className="app__hint">
        <strong>Lecture des dates :</strong> la date de <strong>début</strong> d'une tâche correspond
        à sa date de début Trello si elle existe, sinon à sa <strong>date de création</strong> ; sa
        date de <strong>fin</strong> correspond à son échéance (à défaut, une courte barre est
        affichée). Les <strong>étapes</strong> (items de checklist) segmentent la barre de chaque
        tâche selon leur statut.
      </div>

      {error && (
        <div className="app__error" role="alert">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {model && (
        <>
          <Legend lists={model.lists} />
          <GanttChart model={model} />
          <footer className="app__footer">
            {model.rows.length} tâche(s){' '}
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
