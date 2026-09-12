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

// Couleurs officielles des étiquettes Trello (l'API renvoie le nom, pas l'hex).
const TRELLO_LABEL_COLORS = {
  green: '#61bd4f',
  yellow: '#f2d600',
  orange: '#ff9f1a',
  red: '#eb5a46',
  purple: '#c377e0',
  blue: '#0079bf',
  sky: '#00c2e0',
  lime: '#51e898',
  pink: '#ff80ce',
  black: '#3d444b',
  gray: '#8a8a8a',
  // Anciennes variantes « light gray / dark gray » :
  'light gray': '#b3bac4',
  'light green': '#7bc86c',
  'light yellow': '#f7d74e',
  'light orange': '#ffab4a',
  'light red': '#ec9488',
  'light purple': '#cbadd3',
  'light blue': '#add3ff',
  'light pink': '#eaaaae',
  'dark blue': '#0066a6',
};

// Un segment = une période passée dans une colonne. Couleur = celle de la
// liste ; le dernier segment (colonne actuelle d'une tâche non terminée) est
// hachuré « en cours ».
export const STEP_STATE_META = {
  done: { label: 'Colonne traversée', color: null },
  current: { label: 'Colonne actuelle (en cours)', color: null },
  revisit: { label: 'Retour dans une colonne déjà quittée', color: null },
};

/**
 * Construit le modèle du Gantt.
 *
 * Les « étapes » sont les **changements de colonne** de la carte (historique
 * Trello / actions `updateCard:idList`), et non les checklists. Chaque segment
 * de la barre représente une période passée dans une liste donnée.
 *
 * @param {object} raw - { board, lists, closedLists, labels, cards, members, movesByCardId } de fetchBoardData
 * @returns {{ title, rows, membersById, listColors, lists, min, max }}
 */
export function buildGanttModel({ board, lists, closedLists = [], labels = [], cards, members, movesByCardId = {}, dueHistoryByCardId = {}, archivedAtByCardId = {} }) {
  // Couleur par liste = étape (colonne du board)
  const listColors = {};
  lists.forEach((l, i) => {
    listColors[l.id] = LIST_PALETTE[i % LIST_PALETTE.length];
  });
  // Résolution des noms : listes ouvertes + fermées (cartes archivées).
  const listById = {};
  for (const l of [...lists, ...closedLists]) listById[l.id] = l;
  const listName = (id) => listById[id]?.name || '(hors liste)';

  // Étiquettes (tags) du board, pour les chips sur les cartes.
  // L'API renvoie soit un nom de couleur ("red", "blue"…), soit colorHex.
  const labelsById = {};
  for (const l of labels) labelsById[l.id] = l;

  const membersById = {};
  for (const m of members) membersById[m.id] = m;

  // Une tâche est « terminée » si elle est archivée OU si elle se trouve dans
  // la dernière colonne du tableau (par position).
  const listsByPos = [...lists].sort((a, b) => (a.pos || 0) - (b.pos || 0));
  const lastListId = listsByPos.length ? listsByPos[listsByPos.length - 1].id : null;
  // Rang de chaque colonne dans le flux (sert à détecter les retours en arrière)
  const listIndex = {};
  listsByPos.forEach((l, i) => {
    listIndex[l.id] = i;
  });

  const now = new Date();
  const openCards = cards.filter((c) => !c.closed);
  const closedCards = cards.filter((c) => c.closed);
  const all = [...openCards, ...closedCards];

  const rows = all.map((c) => {
    const created = createdAtFromCardId(c.id) ?? new Date(0);
    const start = toDate(c.start) || created;
    const due = toDate(c.due);
    const done = !!c.closed || (lastListId != null && c.idList === lastListId);

    // --- Segments = périodes passées dans chaque colonne -------------------
    // bornées par les déplacements de la carte (ignorés si antérieurs au début).
    const moves = (movesByCardId[c.id] || []).filter((m) => m.date >= start);
    const boundaries = [{ at: start, listId: firstListId(moves, c.idList) }];
    for (const m of moves) {
      const last = boundaries[boundaries.length - 1];
      if (m.listAfter === last.listId) continue; // pas un vrai changement
      boundaries.push({ at: m.date, listId: m.listAfter });
    }

    // Fin de la tâche :
    //  - terminée : date de la DERNIÈRE ÉTAPE (entrée dans la colonne actuelle) ;
    //    si la carte a été archivée sans jamais atteindre la dernière colonne,
    //    date d'archivage. La due date n'étend JAMAIS la barre.
    //  - non terminée : se prolonge jusqu'à aujourd'hui (et au-delà si en retard).
    const lastBoundary = boundaries[boundaries.length - 1].at;
    let taskEnd;
    if (done) {
      const inLastColumn = lastListId != null && c.idList === lastListId;
      const archivedAt = inLastColumn ? null : archivedAtByCardId[c.id] || null;
      taskEnd = archivedAt && archivedAt > lastBoundary ? archivedAt : lastBoundary;
    } else {
      taskEnd = now > start ? now : start;
      if (due && due > taskEnd) taskEnd = due; // en retard -> visible jusqu'à l'échéance
    }
    if (taskEnd <= lastBoundary) taskEnd = new Date(lastBoundary.getTime() + MIN_TASK_MS);

    const steps = boundaries.map((b, i) => {
      const next = i + 1 < boundaries.length ? boundaries[i + 1].at : taskEnd;
      const isLast = i === boundaries.length - 1;
      return {
        listId: b.listId,
        listName: listName(b.listId),
        color: listColors[b.listId] || '#94a3b8',
        from: b.at,
        to: next,
        // Dernier segment = colonne actuelle ; traversés = terminé ;
        // un retour vers une colonne déjà vue est signalé en jaune.
        state: isLast ? (done ? 'done' : 'current') : 'done',
      };
    });
    // Repère « retour en arrière » : une colonne revisitée (hors dernier segment)
    // + drapeau « back » quand la carte recule dans le flux (index de colonne
    // inférieur au maximum atteint jusqu'ici) -> flèche ◀ côté affichage.
    const seen = new Set();
    let maxIdx = -1;
    for (const s of steps) {
      const idx = s.listId in listIndex ? listIndex[s.listId] : maxIdx;
      if (maxIdx >= 0 && idx < maxIdx) s.back = true;
      if (s.state !== 'current' && seen.has(s.listId)) s.state = 'revisit';
      seen.add(s.listId);
      maxIdx = Math.max(maxIdx, idx);
    }

    return {
      id: c.id,
      name: c.name,
      // Lien direct vers la carte : https://trello.com/c/<shortLink>
      url: c.shortLink ? `https://trello.com/c/${c.shortLink}` : null,
      listId: c.idList,
      listName: listName(c.idList),
      color: listColors[c.idList] || '#94a3b8',
      start,
      end: taskEnd > start ? taskEnd : new Date(start.getTime() + MIN_TASK_MS),
      due,
      closed: !!c.closed,
      done,
      // Échéances antérieures (repoussées), hors de la valeur actuelle.
      dueHistory: (dueHistoryByCardId[c.id] || []).filter(
        (h) => !due || h.due.getTime() !== due.getTime()
      ),
      members: (c.idMembers || []).map((id) => membersById[id]).filter(Boolean),
      labels: (c.idLabels || [])
        .map((id) => labelsById[id])
        .filter(Boolean)
        .map((l) => ({
          id: l.id,
          name: l.name || '',
          color:
            l.colorHex ||
            (typeof l.color === 'string' && l.color.startsWith('#')
              ? l.color
              : TRELLO_LABEL_COLORS[l.color]) ||
            '#94a3b8',
        })),
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

/** Colonne d'origine de la carte : premier listBefore connu, sinon colonne actuelle. */
function firstListId(moves, currentListId) {
  return moves.length ? moves[0].listBefore || currentListId : currentListId;
}
