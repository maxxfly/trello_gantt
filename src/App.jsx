import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchBoardData } from "./trelloApi.js";
import { buildGanttModel } from "./ganttModel.js";
import GanttChart from "./GanttChart.jsx";
import Legend from "./Legend.jsx";
import TagSelect from "./TagSelect.jsx";
import { getDemoData } from "./demoData.js";

const LS_PROFILES = "gantt-trello-profiles";
const LS_LAST = "gantt-trello-last-profile";
const LS_FILTER = "gantt-trello-card-filter";
const LS_PERIOD = "gantt-trello-period";
const LS_THEME = "gantt-trello-theme";

/** Thème initial : choix mémorisé, sinon préférence système. */
function initialTheme() {
  const saved = localStorage.getItem(LS_THEME);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const CARD_FILTERS = {
  board: "Du tableau",
  archived: "Archivées",
  both: "Les deux",
};

/** Normalise pour la recherche : minuscules sans accents. */
function normSearch(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Applique le filtre cartes actives / archivées aux lignes du modèle. */
function filterRows(rows, filter) {
  if (filter === "board") return rows.filter((r) => !r.closed);
  if (filter === "archived") return rows.filter((r) => r.closed);
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Résumé par étape (colonne) : jours passés dans chaque colonne, calculés sur
 * les lignes filtrées et écrêtés à la période choisie (si active).
 * Retour : [{ listId, listName, color, days, tasks }] trié par ordre des colonnes.
 */
function summarizeByList(rows, lists, period) {
  const f = parseDateInput(period.from);
  const t = parseDateInput(period.to);
  const tEnd = t ? new Date(t.getTime() + DAY_MS) : null; // exclusif
  const acc = new Map();
  for (const r of rows) {
    for (const s of r.steps || []) {
      let from = s.from.getTime();
      let to = s.to.getTime();
      if (f) from = Math.max(from, f.getTime());
      if (tEnd) to = Math.min(to, tEnd.getTime());
      const days = (to - from) / DAY_MS;
      if (days <= 0) continue;
      const e = acc.get(s.listId) || {
        listId: s.listId,
        listName: s.listName,
        color: s.color,
        days: 0,
        tasks: new Set(),
      };
      e.days += days;
      e.tasks.add(r.id);
      acc.set(s.listId, e);
    }
  }
  // Ordre des colonnes du board, puis colonnes inconnues à la fin.
  const order = new Map(lists.map((l, i) => [l.id, i]));
  return [...acc.values()]
    .map((e) => ({ ...e, days: Math.round(e.days), tasks: e.tasks.size }))
    .sort(
      (a, b) => (order.get(a.listId) ?? 1e9) - (order.get(b.listId) ?? 1e9),
    );
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** "YYYY-MM-DD" local (sans décalage UTC). */
function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bornes rapides du filtre de période. */
function periodPreset(kind) {
  const now = new Date();
  if (kind === "week") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: ymd(mon), to: ymd(sun) };
  }
  if (kind === "month") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  // quarter
  const q = Math.floor(now.getMonth() / 3);
  return {
    from: ymd(new Date(now.getFullYear(), q * 3, 1)),
    to: ymd(new Date(now.getFullYear(), q * 3 + 3, 0)),
  };
}

/** Export CSV (RFC 4180 : guillemets doublés, BOM pour Excel). */
function exportCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = [
    "Titre",
    "Colonne",
    "Debut",
    "Fin",
    "Echeance",
    "Statut",
    "Tags",
    "Membres",
    "Lien",
  ];
  const lines = [head.join(";")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.name),
        esc(r.listName),
        esc(ymd(r.start)),
        esc(ymd(r.end)),
        esc(r.due ? ymd(r.due) : ""),
        esc(r.closed ? "archivee" : r.done ? "terminee" : "en cours"),
        esc((r.labels || []).map((l) => l.name).join(", ")),
        esc((r.members || []).map((m) => m.fullName || m.username).join(", ")),
        esc(r.url || ""),
      ].join(";"),
    );
  }
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gantt-${ymd(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

/** Nom de fichier d'export (assaini). */
function exportBaseName(title) {
  const clean = (title || "gantt")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${clean || "gantt"}-${ymd(new Date())}`;
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
    const legacy = localStorage.getItem("gantt-trello-config");
    if (legacy) {
      const p = JSON.parse(legacy);
      if (p && p.board && p.token) {
        const profile = {
          id: uid(),
          name: "Mon tableau",
          board: p.board,
          token: p.token,
          apiKey: p.apiKey || "",
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
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(LS_LAST) || "",
  );
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenAuthed, setTokenAuthed] = useState(false);
  // Erreur specifique a la recuperation du token (affichee dans la popin).
  const [tokenError, setTokenError] = useState(null);
  const [board, setBoard] = useState("");
  const [apiKey, setApiKey] = useState("");
  // Popup de réglages (Tableau / Token / Clé d'API).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Popup d'aide (profils, obtention du token, lecture des dates).
  const [helpOpen, setHelpOpen] = useState(false);
  // Popup de création / renommage d'un profil : null | { mode: 'new' | 'edit' }.
  const [profileModal, setProfileModal] = useState(null);
  const [draftName, setDraftName] = useState("");
  // Thème clair / sombre.
  const [theme, setTheme] = useState(initialTheme);

  // Applique le thème sur <html> (les variables CSS suivent [data-theme]).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [cardFilter, setCardFilter] = useState(
    () => localStorage.getItem(LS_FILTER) || "both",
  );
  // Période optionnelle { from, to } en format "YYYY-MM-DD" (vide = tout).
  const [period, setPeriod] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PERIOD) || "null");
      if (p && (p.from || p.to)) return { from: p.from || "", to: p.to || "" };
    } catch {
      /* ignore */
    }
    return { from: "", to: "" };
  });

  // Évite l'auto-chargement lors du parcours des champs depuis les profils
  const firstRender = useRef(true);

  // Conteneur du Gantt (pour la capture PNG/PDF) + état d'export en cours.
  const ganttWrapRef = useRef(null);
  const [exporting, setExporting] = useState(null); // 'png' | 'pdf' | null

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId],
  );

  // Lignes filtrées (actives / archivées / les deux) + compteurs pour le filtre.
  const counts = useMemo(() => {
    if (!model) return { open: 0, closed: 0 };
    const closed = model.rows.filter((r) => r.closed).length;
    return { open: model.rows.length - closed, closed };
  }, [model]);

  // Filtre par tags : ensemble d'IDs sélectionnés (vide = aucun filtre).
  const [labelFilter, setLabelFilter] = useState(() => new Set());
  const allLabels = useMemo(() => {
    if (!model) return [];
    const byId = new Map();
    for (const r of model.rows)
      for (const l of r.labels || []) byId.set(l.id, l);
    return [...byId.values()].sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
  }, [model]);
  const toggleLabel = (id) => {
    setLabelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Recherche libre : nom de carte, colonne, tag ou membre (insensible à la
  // casse et aux accents).
  const [search, setSearch] = useState("");

  const filteredModel = useMemo(() => {
    if (!model) return null;
    let rows = filterRows(model.rows, cardFilter);
    rows = filterRowsByPeriod(rows, period.from, period.to);
    if (labelFilter.size > 0) {
      // Une carte est gardée si elle porte AU MOINS UN des tags sélectionnés.
      rows = rows.filter((r) =>
        (r.labels || []).some((l) => labelFilter.has(l.id)),
      );
    }
    const q = normSearch(search);
    if (q) {
      // Recherche sur le titre uniquement.
      rows = rows.filter((r) => normSearch(r.name).includes(q));
    }
    return { ...model, rows };
  }, [model, cardFilter, period, labelFilter, search]);

  const periodActive = !!(period.from || period.to);

  // Résumé : jours cumulés par colonne (étape), sur les lignes affichées et
  // écrêtés à la période choisie.
  const summary = useMemo(() => {
    if (!filteredModel) return [];
    return summarizeByList(filteredModel.rows, model.lists, period);
  }, [filteredModel, model, period]);

  const setPeriodPart = (key, value) => {
    setPeriod((p) => {
      const next = { ...p, [key]: value };
      if (next.from || next.to)
        localStorage.setItem(LS_PERIOD, JSON.stringify(next));
      else localStorage.removeItem(LS_PERIOD);
      return next;
    });
  };

  const resetPeriod = () => {
    localStorage.removeItem(LS_PERIOD);
    setPeriod({ from: "", to: "" });
  };

  const applyPreset = (kind) => {
    const p = periodPreset(kind);
    localStorage.setItem(LS_PERIOD, JSON.stringify(p));
    setPeriod(p);
  };

  /** Lance une capture (PNG ou PDF) du Gantt affiché, avec garde anti-rentree. */
  const runExport = useCallback(
    async (kind) => {
      const el = ganttWrapRef.current;
      if (!el || exporting) return;
      setExporting(kind);
      setError(null);
      try {
        // html2canvas + jsPDF (~500 kB) sont chargés à la demande, pas au 1er rendu.
        const { exportPng, exportPdf } = await import("./exportImage.js");
        const base = exportBaseName(model?.title);
        if (kind === "png") await exportPng(el, `${base}.png`);
        else await exportPdf(el, `${base}.pdf`, model?.title || "Gantt");
      } catch (e) {
        setError(
          `Export impossible : ${e.message || e}. (Les avatars distants peuvent bloquer la capture selon les en-têtes CORS de Trello — réessayez ou utilisez l'export CSV.)`,
        );
      } finally {
        setExporting(null);
      }
    },
    [exporting, model],
  );

  const applyRaw = (raw) => {
    setModel(buildGanttModel(raw));
    setLastLoaded(new Date());
  };

  const persistProfiles = useCallback((next) => {
    setProfiles(next);
    saveProfiles(next);
  }, []);

  /**
   * Crée un nouveau profil ou renomme/met à jour celui sélectionné, à partir
   * du nom saisi dans la popup. Les identifiants du formulaire sont repris.
   */
  const confirmProfile = useCallback(() => {
    if (!profileModal) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Donnez un nom au profil (ex : « Projet Alpha »).");
      return;
    }
    const taken = profiles.some(
      (p) =>
        p.id !== (profileModal.mode === "edit" ? selectedId : null) &&
        p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) {
      setError(`Un profil « ${trimmed} » existe déjà.`);
      return;
    }
    if (profileModal.mode === "new") {
      const profile = {
        id: uid(),
        name: trimmed,
        board: board.trim(),
        token: token.trim(),
        apiKey: apiKey.trim(),
        updatedAt: new Date().toISOString(),
      };
      persistProfiles([...profiles, profile]);
      setSelectedId(profile.id);
      localStorage.setItem(LS_LAST, profile.id);
    } else {
      const existing = profiles.find((p) => p.id === selectedId);
      if (!existing) return;
      const profile = {
        ...existing,
        name: trimmed,
        board: board.trim(),
        token: token.trim(),
        apiKey: apiKey.trim(),
        updatedAt: new Date().toISOString(),
      };
      persistProfiles(profiles.map((p) => (p.id === profile.id ? profile : p)));
    }
    setName(trimmed);
    setError(null);
    setProfileModal(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }, [profileModal, draftName, profiles, selectedId, board, token, apiKey, persistProfiles]);

  /** Charge un profil enregistré dans le formulaire. */
  const selectProfile = useCallback(
    (id) => {
      const p = profiles.find((x) => x.id === id);
      if (!p) return;
      setSelectedId(id);
      localStorage.setItem(LS_LAST, id);
      setName(p.name);
      setBoard(p.board || "");
      setToken(p.token || "");
      setApiKey(p.apiKey || "");
      setError(null);
    },
    [profiles],
  );

  /** Ouvre la popup de creation d'un nouveau profil. */
  const openNewProfile = useCallback(() => {
    setDraftName("");
    setError(null);
    setProfileModal({ mode: "new" });
  }, []);

  /** Revenir a « Aucun » : vide le formulaire (les profils restent enregistre). */
  const resetToNoProfile = useCallback(() => {
    setSelectedId("");
    localStorage.removeItem(LS_LAST);
    setName("");
    setBoard("");
    setToken("");
    setApiKey("");
    setModel(null);
    setError(null);
  }, []);

  /** Sélection dans la liste déroulante. */
  const handleProfileChange = useCallback(
    (e) => {
      const v = e.target.value;
      if (v === "") {
        resetToNoProfile();
        return;
      }
      selectProfile(v);
    },
    [selectProfile, resetToNoProfile],
  );

  /** Ouvre la popup de renommage / mise à jour du profil sélectionné. */
  const openRename = useCallback(() => {
    setDraftName(name);
    setError(null);
    setProfileModal({ mode: "edit" });
  }, [name]);

  const deleteProfile = useCallback(() => {
    if (!selectedId) return;
    if (!window.confirm(`Supprimer le profil « ${name} » de ce navigateur ?`))
      return;
    const next = profiles.filter((p) => p.id !== selectedId);
    persistProfiles(next);
    setSelectedId("");
    localStorage.removeItem(LS_LAST);
    setName("");
    setBoard("");
    setToken("");
    setApiKey("");
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

  // Fermeture des popups (réglages / aide) avec Échap.
  useEffect(() => {
    if (!settingsOpen && !helpOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // L'aide est au-dessus des réglages si les deux sont ouverts.
      if (helpOpen) setHelpOpen(false);
      else setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen, helpOpen]);

  const loadDemo = useCallback(() => {
    setError(null);
    applyRaw(getDemoData());
  }, []);

  /** Copie le token dans le presse-papiers (API clipboard + repli execCommand). */
  const copyToken = useCallback(async () => {
    const t = token.trim();
    if (!t) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
      } else {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1600);
    } catch {
      setError(
        "Copie impossible (presse-papiers refusé) : affichez le token, sélectionnez-le et copiez manuellement (Ctrl+C).",
      );
    }
  }, [token]);

  // Au premier rendu : pré-charge le dernier profil et lance le chargement
  useEffect(() => {
    if (!firstRender.current) return;
    firstRender.current = false;
    // Retour d'autorisation Trello (#token=...) : cette fenêtre est peut-être
    // la popup ouverte par « 🔑 » -> on transmet le token à la fenêtre parente.
    const tokenMatch = window.location.hash.match(/[#&]token=([^&]+)/);
    let capturedToken = null;
    if (tokenMatch) {
      capturedToken = decodeURIComponent(tokenMatch[1]);
      setToken(capturedToken);
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(
            { type: "trello-auth-token", token: capturedToken },
            window.location.origin,
          );
        } catch {
          /* parent injoignable */
        }
        window.close();
        return;
      }
      // Ouvert en onglet : on nettoie l'URL (le token ne reste pas visible).
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    const saved = loadProfiles();
    const lastId = localStorage.getItem(LS_LAST);
    const p = saved.find((x) => x.id === lastId);
    if (p) {
      setSelectedId(p.id);
      setName(p.name);
      setBoard(p.board || "");
      // Un token fraîchement capté prime sur celui, souvent périmé, du profil.
      if (!capturedToken) setToken(p.token || "");
      setApiKey(p.apiKey || "");
      const tk = capturedToken || p.token;
      if (tk && p.board) {
        fetchBoardData(p.board, tk, p.apiKey || "")
          .then((raw) => {
            applyRaw(raw);
          })
          .catch((e) => setError(e.message || String(e)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Réception du token renvoyé par la popup « 🔑 Obtenir le token ».
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data;
      if (d && d.type === "trello-auth-token" && typeof d.token === "string") {
        setToken(d.token);
        setError(null);
        setTokenAuthed(true);
        setTimeout(() => setTokenAuthed(false), 2000);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /**
   * Ouvre trello.com/1/authorize en popup (lecture seule, expiration never).
   * Trello renvoie #token=... sur cette même page ; la popup transmet le token
   * via postMessage (repli : lecture de son URL). Nécessite l'origine de l'app
   * dans « Origines autorisées » du Power-Up.
   */
  const requestToken = useCallback(() => {
    const key = apiKey.trim();
    if (!key) {
      setTokenError(
        "Renseignez d'abord la Clé d'API ci-dessous (onglet « Clé d'API » de trello.com/power-ups/admin — pas le « Secret »).",
      );
      return;
    }
    if (!/^[0-9a-f]{32}$/i.test(key)) {
      setTokenError(
        `Clé d'API invalide (${key.length} caractère(s)) : attendu 32 caractères hexadécimaux, sans espace.`,
      );
      return;
    }
    setTokenError(null);
    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const url =
      "https://trello.com/1/authorize?expiration=never&scope=read&response_type=token" +
      `&key=${encodeURIComponent(key)}` +
      `&return_url=${encodeURIComponent(returnUrl)}&callback_method=fragment`;
    const popup = window.open(
      url,
      "trello-authorize",
      "popup=yes,width=640,height=720",
    );
    if (!popup) {
      // Popup bloquée par le navigateur : ouvrir en onglet (le #token= sera
      // capté au retour sur l'app, cf. effet du premier rendu).
      window.open(url, "_blank");
      return;
    }
    // Filet de sécurité si postMessage ne parvient pas.
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        return;
      }
      let href = "";
      try {
        href = popup.location.href; // lisible une fois revenu sur notre origine
      } catch {
        return; // encore sur trello.com
      }
      const m = href.match(/[#&]token=([^&]+)/);
      if (m) {
        clearInterval(timer);
        try {
          popup.close();
        } catch {
          /* déjà fermée */
        }
        setToken(decodeURIComponent(m[1]));
        setTokenAuthed(true);
        setTimeout(() => setTokenAuthed(false), 2000);
      }
    }, 300);
  }, [apiKey]);

  return (
    <div className="app">
      <form
        className="app__header"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        {/* Ligne 1 : titre a gauche, aide + theme a droite */}
        <div className="app__row app__row--top">
          <div className="app__brand">
            <img className="app__logo" src="./favicon.svg" alt="" width="44" height="44" />
            <div>
              <h1>Gantt Trello</h1>
              <p>Visualisez les tâches et leurs étapes sur une timeline.</p>
            </div>
          </div>
          <div className="app__topbar">
            <button
              className="app__help"
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Aide : profils, obtention du token, lecture du Gantt"
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
            >
              ❓
            </button>
            <button
              className="app__help"
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}
              aria-label={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        {/* Ligne 2 : gestion du profil a gauche, connexion Trello a cote */}
        <div className="app__row app__row--mid">
          <div className="app__profiles">
            <label className="app__field app__field--select">
              <span>Profil</span>
              <select value={selectedId} onChange={handleProfileChange}>
                <option value="">Aucun</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="app__mini"
              type="button"
              onClick={openNewProfile}
              disabled={loading}
              title="Créer un nouveau profil"
              aria-label="Créer un nouveau profil"
            >
              ＋
            </button>
            {selectedProfile && (
              <div className="app__profile-actions">
                <button
                  className="app__mini"
                  type="button"
                  onClick={openRename}
                  disabled={loading}
                  title="Renommer / mettre à jour ce profil"
                  aria-label="Renommer le profil"
                >
                  ✎
                </button>
                <button
                  className="app__mini"
                  type="button"
                  onClick={deleteProfile}
                  disabled={loading}
                  title="Supprimer ce profil de ce navigateur"
                  aria-label="Supprimer le profil"
                >
                  🗑
                </button>
                {savedFlash && (
                  <span className="app__profile-saved" aria-live="polite">
                    ✓ Enregistré
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            className="app__settings"
            type="button"
            onClick={() => {
              setTokenError(null);
              setSettingsOpen(true);
            }}
            disabled={!selectedId}
            title={
              selectedId
                ? "Régler le tableau, le token et la clé d'API"
                : "Créez d'abord un profil (bouton ＋) pour débloquer la connexion"
            }
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
          >
            ⚙️ Connexion Trello
            <span
              className={`app__settings-dot${board.trim() && token.trim() ? " app__settings-dot--ok" : ""}`}
              aria-hidden
            />
          </button>
        </div>

        {/* Ligne 3 : Afficher le Gantt (profil + token requis) + Démo */}
        <div className="app__row app__row--bottom">
          <button
            className="app__submit"
            type="submit"
            disabled={!selectedId || !token.trim() || loading}
            title={
              !selectedId
                ? "Sélectionnez (ou créez) d'abord un profil"
                : !token.trim()
                  ? "Renseignez d'abord le token dans ⚙️ Connexion Trello"
                  : undefined
            }
          >
            {loading ? "Chargement…" : "Afficher le Gantt"}
          </button>
          <button
            className="app__demo"
            type="button"
            onClick={loadDemo}
            disabled={loading}
          >
            Démo
          </button>
        </div>

          {profileModal && (
            <div
              className="settings__backdrop"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setProfileModal(null);
              }}
            >
              <div
                className="settings"
                role="dialog"
                aria-modal="true"
                aria-label={
                  profileModal.mode === "new" ? "Nouveau profil" : "Renommer le profil"
                }
              >
                <div className="settings__head">
                  <h2>
                    {profileModal.mode === "new" ? "＋ Nouveau profil" : "✎ Renommer le profil"}
                  </h2>
                  <button
                    type="button"
                    className="app__mini"
                    onClick={() => setProfileModal(null)}
                    title="Fermer"
                    aria-label="Fermer"
                  >
                    ✕
                  </button>
                </div>

                <label className="app__field">
                  <span>Nom du profil</span>
                  <input
                    type="text"
                    placeholder="ex : Projet Alpha"
                    value={draftName}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmProfile();
                      }
                    }}
                    spellCheck={false}
                  />
                </label>

                <p className="settings__note">
                  {profileModal.mode === "new"
                    ? "Le profil enregistrera le tableau, le token et la clé d'API saisis dans ⚙️ Connexion Trello, dans ce navigateur (localStorage)."
                    : "Modifiez le nom ; les identifiants actuellement saisis seront réenregistrés sur ce profil."}
                </p>

                <div className="settings__actions">
                  <button
                    type="button"
                    className="app__ghost"
                    onClick={() => setProfileModal(null)}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="app__submit"
                    onClick={confirmProfile}
                  >
                    {profileModal.mode === "new" ? "Créer" : "Enregistrer"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {settingsOpen && (
            <div
              className="settings__backdrop"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setSettingsOpen(false);
              }}
            >
              <div
                className="settings"
                role="dialog"
                aria-modal="true"
                aria-label="Connexion Trello"
              >
                <div className="settings__head">
                  <h2>⚙️ Connexion Trello</h2>
                  <button
                    type="button"
                    className="app__mini"
                    onClick={() => setSettingsOpen(false)}
                    title="Fermer"
                    aria-label="Fermer les réglages"
                  >
                    ✕
                  </button>
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

                <div className="app__field">
                  <span>Token</span>
                  <div className="app__token-row">
                    <input
                      type={tokenVisible ? "text" : "password"}
                      placeholder="token API Trello"
                      aria-label="Token API Trello"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="app__mini"
                      onClick={() => setTokenVisible((v) => !v)}
                      disabled={!token}
                      title={tokenVisible ? "Masquer le token" : "Afficher le token"}
                      aria-label={tokenVisible ? "Masquer le token" : "Afficher le token"}
                    >
                      {tokenVisible ? "🙈" : "👁️"}
                    </button>
                    <button
                      type="button"
                      className="app__mini"
                      onClick={copyToken}
                      disabled={!token}
                      title="Copier le token dans le presse-papiers"
                    >
                      {tokenCopied ? "✓" : "⧉"}
                    </button>
                    <button
                      type="button"
                      className={`app__mini app__mini--auth${tokenAuthed ? " app__mini--ok" : ""}`}
                      onClick={requestToken}
                      disabled={loading}
                      title={
                        tokenAuthed
                          ? "Token reçu ✓"
                          : "Obtenir le token automatiquement : ouvre trello.com/1/authorize (lecture seule). Requiert l'adresse de cette app dans « Origines autorisées » du Power-Up."
                      }
                    >
                      {tokenAuthed ? "✓" : "🔑"}
                    </button>
                  </div>
                  {tokenError && (
                    <p className="settings__error" role="alert">
                      {tokenError}
                    </p>
                  )}
                </div>

                <label className="app__field">
                  <span>
                    Clé d'API <em>(optionnelle)</em>
                  </span>
                  <input
                    type="text"
                    placeholder="clé d'API du Power-Up"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      if (tokenError) setTokenError(null);
                    }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>

                <p className="settings__note">
                  La clé d'API se copie sur{" "}
                  <a
                    href="https://trello.com/power-ups/admin"
                    target="_blank"
                    rel="noreferrer"
                  >
                    trello.com/power-ups/admin
                  </a>{" "}
                  (onglet « Clé d'API » : copiez « Clé d'API », <em>pas</em> « Secret »).
                  Pour le token : saisissez la clé ci-dessus puis cliquez{" "}
                  <strong>🔑</strong> — autorisation en un clic (votre adresse doit
                  figurer dans « Origines autorisées »). Repli manuel via{" "}
                  <code>
                    trello.com/1/authorize?…&amp;key=VOTRE_CLE
                  </code>
                  .
                </p>

                <div className="settings__actions">
                  <button
                    type="button"
                    className="app__ghost"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Annuler
                  </button>
                  <button
                    className="app__submit"
                    type="submit"
                    disabled={loading}
                    onClick={() => setSettingsOpen(false)}
                  >
                    {loading ? "Chargement…" : "Afficher le Gantt"}
                  </button>
                </div>
              </div>
            </div>
          )}
      </form>

      {helpOpen && (
        <div
          className="settings__backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false);
          }}
        >
          <div
            className="settings settings--help"
            role="dialog"
            aria-modal="true"
            aria-label="Aide"
          >
            <div className="settings__head">
              <h2>❓ Aide</h2>
              <button
                type="button"
                className="app__mini"
                onClick={() => setHelpOpen(false)}
                title="Fermer"
                aria-label="Fermer l'aide"
              >
                ✕
              </button>
            </div>

            <div className="app__hint">
              <strong>Profils :</strong> nommez, enregistrez et retrouvez vos tableaux
              (avec token et clé d'API) directement dans ce navigateur (localStorage).
              Le dernier profil utilisé est rechargé automatiquement à l'ouverture, et
              « Afficher le Gantt » met à jour le profil sélectionné. Attention : le
              token est enregistré en clair dans ce navigateur — ne l'utilisez que sur
              un poste de confiance.
            </div>

            <div className="app__hint">
              <strong>Comment obtenir un token ?</strong> Ouvrez{" "}
              <strong>⚙️ Connexion Trello</strong> pour saisir vos identifiants. Créez
              une clé d'API sur{" "}
              <a
                href="https://trello.com/power-ups/admin"
                target="_blank"
                rel="noreferrer"
              >
                trello.com/power-ups/admin
              </a>
              , puis générez un token en lecture seule via l'URL{" "}
              <code>
                https://trello.com/1/authorize?expiration=never&amp;scope=read&amp;response_type=token&amp;key=VOTRE_CLE
              </code>
              . Les identifiants sont stockés uniquement dans votre navigateur et
              transmis directement à l'API Trello. Vous pouvez aussi cliquer sur{" "}
              <strong>Démo</strong> pour voir un exemple sans compte.
            </div>

            <div className="app__hint">
              <strong>Lecture des dates :</strong> la date de <strong>début</strong>{" "}
              d'une tâche correspond à sa date de début Trello si elle existe, sinon à
              sa <strong>date de création</strong>. Une tâche{" "}
              <strong>non terminée</strong> (ni archivée, ni dans la dernière colonne)
              se prolonge jusqu'à <strong>aujourd'hui</strong>. Les{" "}
              <strong>étapes</strong> correspondent aux
              <strong> changements de colonne</strong> de la carte (historique Trello)
              : chaque segment coloré représente le temps passé dans une colonne, le
              dernier segment hachuré est la colonne actuelle. Cliquez sur le nom
              d'une tâche pour l'ouvrir dans Trello.
            </div>

            <div className="settings__actions">
              <button
                type="button"
                className="app__ghost"
                onClick={() => setHelpOpen(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="app__error" role="alert">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {model && (
        <>
          <Legend lists={model.lists} />
          {loading && (
            <div
              className="refreshbar"
              role="progressbar"
              aria-label="Actualisation en cours"
            >
              <span />
            </div>
          )}
          <div
            ref={ganttWrapRef}
            className={`ganttwrap${loading ? " is-loading" : ""}`}
          >
            <GanttChart model={filteredModel} />
          </div>
          <footer className="app__footer">
            <div className="app__search">
              <span className="app__field-icon" aria-hidden>
                🔎
              </span>
              <input
                type="search"
                placeholder="Rechercher un titre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                spellCheck={false}
                aria-label="Recherche dans les tâches"
              />
            </div>
            <div
              className="app__filter"
              role="group"
              aria-label="Filtre des cartes"
            >
              {Object.entries(CARD_FILTERS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`app__filter-btn${cardFilter === key ? " app__filter-btn--active" : ""}`}
                  onClick={() => {
                    setCardFilter(key);
                    localStorage.setItem(LS_FILTER, key);
                  }}
                >
                  {label}
                  <span className="app__filter-count">
                    {key === "board"
                      ? counts.open
                      : key === "archived"
                        ? counts.closed
                        : model.rows.length}
                  </span>
                </button>
              ))}
            </div>
            <TagSelect
              labels={allLabels}
              selected={labelFilter}
              onToggle={toggleLabel}
              onClear={() => setLabelFilter(new Set())}
            />
            <div
              className="app__period"
              role="group"
              aria-label="Filtre par période"
            >
              <span className="app__field-icon" aria-hidden>
                📅
              </span>
              <label>
                Du
                <input
                  type="date"
                  value={period.from}
                  max={period.to || undefined}
                  onChange={(e) => setPeriodPart("from", e.target.value)}
                />
              </label>
              <label>
                au
                <input
                  type="date"
                  value={period.to}
                  min={period.from || undefined}
                  onChange={(e) => setPeriodPart("to", e.target.value)}
                />
              </label>
              <span className="app__period-presets">
                <button
                  type="button"
                  className="app__preset"
                  onClick={() => applyPreset("week")}
                  title="Semaine en cours (lundi → dimanche)"
                >
                  Semaine
                </button>
                <button
                  type="button"
                  className="app__preset"
                  onClick={() => applyPreset("month")}
                  title="Mois en cours"
                >
                  Mois
                </button>
                <button
                  type="button"
                  className="app__preset"
                  onClick={() => applyPreset("quarter")}
                  title="Trimestre en cours"
                >
                  Trimestre
                </button>
              </span>
              {periodActive && (
                <button
                  type="button"
                  className="app__period-reset"
                  onClick={resetPeriod}
                >
                  ✕ Réinitialiser
                </button>
              )}
            </div>
            <div className="app__exports" role="group" aria-label="Exporter">
              <button
                className="app__export"
                type="button"
                onClick={() => runExport("png")}
                disabled={!!exporting}
                title="Exporter le Gantt affiché en image PNG (tout le contenu, même hors écran)"
              >
                {exporting === "png" ? "…" : "🖼️ PNG"}
              </button>
              <button
                className="app__export"
                type="button"
                onClick={() => runExport("pdf")}
                disabled={!!exporting}
                title="Exporter le Gantt affiché en PDF paysage (multipage si nécessaire)"
              >
                {exporting === "pdf" ? "…" : "📄 PDF"}
              </button>
              <button
                className="app__export"
                type="button"
                onClick={() => exportCsv(filteredModel.rows)}
                title="Exporter les tâches affichées (filtres appliqués) en CSV"
              >
                📋 CSV
              </button>
            </div>
            {filteredModel.rows.length} tâche(s) affichée(s) sur{" "}
            {model.rows.length}{" "}
            {lastLoaded
              ? `· chargées le ${lastLoaded.toLocaleString("fr-FR")}`
              : ""}
          </footer>

          {summary.length > 0 && (
            <div className="app__summary" aria-label="Résumé par étape">
              <span className="app__summary-title">
                Répartition par étape{periodActive ? " (sur la période)" : ""}
              </span>
              {(() => {
                const total = summary.reduce((a, b) => a + b.days, 0) || 1;
                return (
                  <>
                    <div className="app__summary-bar">
                      {summary.map((s) => (
                        <span
                          key={s.listId}
                          className="app__summary-seg"
                          style={{
                            width: `${(s.days / total) * 100}%`,
                            background: s.color,
                          }}
                          title={`${s.listName} : ${Math.round(
                            (s.days / total) * 100,
                          )} % · ${s.days} j · ${s.tasks} tâche(s)`}
                        />
                      ))}
                    </div>
                    <ul className="app__summary-list">
                      {summary.map((s) => (
                        <li key={s.listId}>
                          <span
                            className="legend__swatch"
                            style={{ background: s.color }}
                          />
                          {s.listName} ·{" "}
                          <strong>{Math.round((s.days / total) * 100)} %</strong>
                          <em>
                            {" "}
                            · {s.days} j · {s.tasks} tâche(s)
                          </em>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}

      {loading && !model && <LoadingSkeleton />}

      {!model && !error && !loading && (
        <div className="app__placeholder">
          Créez d'abord un profil avec le bouton <strong>＋</strong>, renseignez{" "}
          <strong>⚙️ Connexion Trello</strong> (tableau, token, clé d'API), puis
          cliquez sur « Afficher le Gantt » — ou sur « Démo » pour un exemple.
        </div>
      )}
    </div>
  );
}

/**
 * Squelette animé affiché pendant le chargement initial (aucune donnée en
 * mémoire) : barre de progression indeterminate + fausses lignes de Gantt en
 * shimmer. Disparait dès que le modèle arrive (fondu géré par le CSS du bloc).
 */
function LoadingSkeleton() {
  const rows = [
    { w: 42, left: 6, tone: 0 },
    { w: 58, left: 20, tone: 1 },
    { w: 30, left: 34, tone: 2 },
    { w: 66, left: 12, tone: 0 },
    { w: 24, left: 48, tone: 1 },
  ];
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label="Chargement du tableau Trello">
      <div className="skeleton__head">
        <span className="skeleton__spinner" aria-hidden />
        <span className="skeleton__label">Chargement du tableau…</span>
      </div>
      <div className="skeleton__track">
        <div className="skeleton__progress" />
      </div>
      <div className="skeleton__chart">
        {rows.map((r, i) => (
          <div className="skeleton__row" key={i}>
            <div className="skeleton__side">
              <span className="skeleton__dot" />
              <span className="skeleton__bar" style={{ width: "70%" }} />
            </div>
            <div className="skeleton__lane">
              <span
                className={`skeleton__block tone-${r.tone}`}
                style={{ left: `${r.left}%`, width: `${r.w}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
