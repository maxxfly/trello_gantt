// Transforme les données brutes Trello en modèle pour le Gantt.

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TASK_MS = 12 * 60 * 60 * 1000; // largeur minimale d'une barre

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Répartition stable de couleurs pour les listes (étapes globales)
export const LIST_PALETTE = [
  '#4f8ef7',
  '#f5a623',
  '#3ecf8e',
  '#e05c7a',
  '#9b6ef3',
  '#2bc4d3',
  '#f77f4f',
  '#8ab83c',
  '#d156d6',
  '#5aa9e6',
];

export const STEP_STATE_META = {
  complete: { label: 'Étape terminée', color: '#1f9d55' },
  incomplete: { label: 'Étape à faire', color: '#e8b931' },
  unknown: { label: 'Étape en cours', color: '#f2733d' },
};

function normalizeStepState(state) {
  if (state === 'complete') return 'complete';
  if (state === 'incomplete') return 'incomplete';
  return 'unknown';
}

/**
 * Construit le modèle du Gantt.
 * @param {object} raw - { board, lists, cards, members } de fetchBoardData
 * @returns {{ title, rows, membersById, listColors, min, max }}
 */
export function buildGanttModel({ board, lists, cards, members, checklistsById = {} }) {
  // Couleur par liste = « étape » globale de la carte (colonne du board)
  const listColors = {};
  lists.forEach((l, i) => {
    listColors[l.id] = LIST_PALETTE[i % LIST_PALETTE.length];
  });

  const membersById = {};
  for (const m of members) membersById[m.id] = m;

  // Ordonner les cartes par date de début (date de création si absente),
  // les cartes fermées en dernier.
  const openCards = cards.filter((c) => !c.closed);
  const closedCards = cards.filter((c) => c.closed);

  const startOf = (c) => {
    // L'API expose parfois "start" ; sinon on utilise la date de création.
    // Les cartes Trello n'ont pas de "created" dans /cards sans le champ :
    // on le récupère via l'ID (les 8 premiers caractères hex = timestamp).
    const s = toDate(c.start);
    if (s) return s;
    const created = createdAtFromCardId(c.id);
    return created ?? new Date(0);
  };

  const all = [...openCards, ...closedCards];
  const rows = all.map((c) => {
    const start = startOf(c);
    const due = toDate(c.due);
    let end = due && due > start ? due : new Date(start.getTime() + MIN_TASK_MS);
    const steps = (c.idChecklists || [])
      .map((id) => checklistsById[id])
      .filter(Boolean)
      .sort((a, b) => (a.pos || 0) - (b.pos || 0))
      .flatMap((cl) =>
        (cl.checkItems || [])
          .sort((a, b) => (a.pos || 0) - (b.pos || 0))
          .map((item) => ({
            name: item.name,
            state: normalizeStepState(item.state),
            due: toDate(item.due),
          }))
      );
    return {
      id: c.id,
      name: c.name,
      listId: c.idList,
      listName: lists.find((l) => l.id === c.idList)?.name || '(hors liste)',
      color: listColors[c.idList] || '#94a3b8',
      start,
      end: end > start ? end : new Date(start.getTime() + MIN_TASK_MS),
      due,
      closed: !!c.closed,
      members: (c.idMembers || []).map((id) => membersById[id]).filter(Boolean),
      steps,
    };
  });

  rows.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));

  // Étendue temporelle du Gantt
  let min = rows.length ? rows[0].start.getTime() : Date.now();
  let max = rows.length ? rows[0].end.getTime() : Date.now() + 7 * DAY_MS;
  for (const r of rows) {
    min = Math.min(min, r.start.getTime());
    max = Math.max(max, r.end.getTime());
  }
  // Marges : début au premier du mois, fin 10 jours après la dernière tâche
  const minDate = new Date(min);
  minDate.setDate(1);
  minDate.setHours(0, 0, 0, 0);
  const maxDate = new Date(max + 10 * DAY_MS);
  maxDate.setHours(0, 0, 0, 0);

  return {
    title: board?.name || 'Tableau',
    rows,
    membersById,
    listColors,
    lists,
    min: minDate,
    max: maxDate,
  };
}

/** Date de création d'une carte Trello à partir de son ID (timestamp hex). */
export function createdAtFromCardId(id) {
  if (!id || id.length < 8) return null;
  const ts = parseInt(id.slice(0, 8), 16);
  if (Number.isNaN(ts)) return null;
  return new Date(ts * 1000);
}
