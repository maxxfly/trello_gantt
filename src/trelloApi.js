// Client pour l'API REST de Trello (https://developer.atlassian.com/cloud/trello/rest/)
// Requêtes GET en JSON, token passé en paramètre d'URL.

const API_BASE = 'https://api.trello.com/1';

/**
 * Extrait l'identifiant du tableau depuis :
 *  - un ID brut (ex: "64f1a2b3c4d5e6f7a8b9c0d1" ou lien court "abc123XY")
 *  - une URL Trello (ex: "https://trello.com/b/abc123XY/mon-tableau")
 */
export function extractBoardId(input) {
  const value = (input || '').trim();
  if (!value) throw new Error('Le champ « Tableau » est vide.');
  if (/^[0-9a-f]{24}$/i.test(value)) return value;
  // URL : prendre le segment après /b/ ou /invite/b/
  const match = value.match(/trello\.com\/(?:invite\/)?b\/([A-Za-z0-9]+)/i);
  if (match) return match[1];
  // Dernier segment hexadécimal de 24 caractères
  const hex = value.match(/([0-9a-f]{24})/i);
  if (hex) return hex[1];
  throw new Error(
    "Impossible de trouver l'ID du tableau. Collez l'URL complète du tableau (https://trello.com/b/...) ou son ID."
  );
}

async function trelloGet(path, { apiKey, token, params = {} }) {
  const search = new URLSearchParams(params);
  if (apiKey) search.set('key', apiKey);
  search.set('token', token);
  const res = await fetch(`${API_BASE}${path}?${search.toString()}`);
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.message || '';
    } catch {
      /* réponse non-JSON */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Token Trello invalide ou permissions insuffisantes (${res.status}).${detail ? ' ' + detail : ''}`
      );
    }
    if (res.status === 404) {
      throw new Error(
        'Tableau introuvable (404). Vérifiez l’URL/ID et que le token donne accès à ce tableau.'
      );
    }
    throw new Error(`Erreur API Trello (${res.status}).${detail ? ' ' + detail : ''}`);
  }
  return res.json();
}

/**
 * Récupère toutes les données nécessaires au Gantt en 3 requêtes :
 * le tableau (avec listes + membres), les cartes et l'historique des
 * déplacements de cartes entre colonnes (= les vraies « étapes »).
 * @param {string} boardInput - URL ou ID du tableau
 * @param {string} token - token API Trello
 * @param {string} [apiKey] - clé d'API (optionnelle pour l'usage personnel)
 */
export async function fetchBoardData(boardInput, token, apiKey = '') {
  if (!token || !token.trim()) throw new Error('Le champ « Token » est vide.');
  const boardId = extractBoardId(boardInput);
  const auth = { apiKey: apiKey.trim(), token: token.trim() };

  const [board, cards, moveActions] = await Promise.all([
    trelloGet(`/boards/${boardId}`, {
      ...auth,
      params: {
        fields: 'name,idOrganization',
        // « all » = listes ouvertes + fermées (les cartes archivées peuvent
        // vivre dans une colonne supprimée depuis).
        lists: 'all',
        list_fields: 'name,id,pos,closed',
        members: 'all',
        member_fields: 'username,fullName,initials,avatarUrl',
        // Étiquettes (tags) du tableau -> board.labels
        labels: 'all',
      },
    }),
    trelloGet(`/boards/${boardId}/cards`, {
      ...auth,
      params: {
        // « all » = cartes actives + archivées (le tri se fera côté affichage).
        filter: 'all',
        fields: 'id,name,start,due,idList,idMembers,closed,pos,shortLink,idLabels',
      },
    }),
    fetchListMoves(boardId, auth),
  ]);

  const allLists = board.lists || [];
  const lists = allLists.filter((l) => !l.closed);
  const closedLists = allLists.filter((l) => l.closed);
  const members = board.members || [];

  // Certains membres assignés à des cartes ne sont plus dans la liste des
  // membres du board (quitté/partagé) : on récupère leur profil (photo,
  // initiales...) individuellement pour afficher les bons avatars.
  const knownIds = new Set(members.map((m) => m.id));
  const missingIds = [
    ...new Set((cards || []).flatMap((c) => c.idMembers || [])),
  ].filter((id) => !knownIds.has(id));
  const extraMembers = await Promise.all(
    missingIds.map((id) =>
      trelloGet(`/members/${id}`, {
        ...auth,
        params: { fields: 'id,username,fullName,initials,avatarUrl' },
      }).catch(() => null)
    )
  );
  for (const m of extraMembers) if (m && m.id) members.push(m);

  //movesByCardId : pour chaque carte, la liste des changements de colonne
  //({ date, listBefore, listAfter }) triés du plus ancien au plus récent.
  //dueHistoryByCardId : anciennes échéances successives (repoussées), issues
  //des actions updateCard:due / updateCard:dueChanged (data.old.due).
  const movesByCardId = {};
  const dueHistoryByCardId = {};
  for (const a of moveActions) {
    const cardId = a.data?.card?.id;
    if (!cardId) continue;
    // L'API renvoie type="updateCard" pour tout : on classe selon les données.
    // Une même action peut contenir les deux (déplacement + échéance) : on
    // traite chaque cas indépendamment.
    const after = a.data?.listAfter?.id;
    if (after && a.date) {
      // Déplacement entre colonnes.
      const before = a.data?.listBefore?.id;
      (movesByCardId[cardId] = movesByCardId[cardId] || []).push({
        date: new Date(a.date),
        listBefore: before || null,
        listAfter: after,
      });
    }
    {
      // Changement d'échéance : l'ancienne valeur (data.old.due) était en
      // vigueur jusqu'à la date de l'action.
      const oldDue = a.data?.old?.due;
      if (oldDue) {
        const list = (dueHistoryByCardId[cardId] = dueHistoryByCardId[cardId] || []);
        const due = new Date(oldDue).getTime();
        if (!list.some((h) => h.due.getTime() === due)) {
          list.push({ due: new Date(oldDue), changedAt: a.date ? new Date(a.date) : null });
        }
      }
    }
  }
  for (const id of Object.keys(movesByCardId)) {
    movesByCardId[id].sort((x, y) => x.date - y.date);
  }
  for (const id of Object.keys(dueHistoryByCardId)) {
    dueHistoryByCardId[id].sort((x, y) => x.due - y.due);
  }

  return { board, lists, closedLists, cards, members, movesByCardId, dueHistoryByCardId, labels: board.labels || [] };
}

/**
 * Historique des déplacements de cartes entre listes ET des changements
 * d'échéance (filter combiné), paginé (100 actions max par requête,
 * jusqu'à 20 pages = 2000 actions).
 */
async function fetchListMoves(boardId, auth) {
  const all = [];
  for (let page = 0; page < 20; page++) {
    const batch = await trelloGet(`/boards/${boardId}/actions`, {
      ...auth,
      params: {
        filter: 'updateCard:idList,updateCard:due,updateCard:dueChanged',
        limit: 100,
        page,
        fields: 'date,type,data',
      },
    });
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}
