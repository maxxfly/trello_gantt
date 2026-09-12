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
        lists: 'open',
        list_fields: 'name,id,pos',
        members: 'all',
        member_fields: 'username,fullName,initials,avatarUrl',
      },
    }),
    trelloGet(`/boards/${boardId}/cards`, {
      ...auth,
      params: {
        fields: 'id,name,start,due,idList,idMembers,closed,pos,shortLink',
      },
    }),
    fetchListMoves(boardId, auth),
  ]);

  const lists = (board.lists || []).filter((l) => !l.closed);
  const members = board.members || [];

  //movesByCardId : pour chaque carte, la liste des changements de colonne
  //({ date, listBefore, listAfter }) triés du plus ancien au plus récent.
  const movesByCardId = {};
  for (const a of moveActions) {
    const cardId = a.data?.card?.id;
    const before = a.data?.listBefore?.id;
    const after = a.data?.listAfter?.id;
    const date = a.date;
    if (!cardId || !after || !date) continue;
    (movesByCardId[cardId] = movesByCardId[cardId] || []).push({
      date: new Date(date),
      listBefore: before || null,
      listAfter: after,
    });
  }
  for (const id of Object.keys(movesByCardId)) {
    movesByCardId[id].sort((x, y) => x.date - y.date);
  }

  return { board, lists, cards, members, movesByCardId };
}

/**
 * Historique des déplacements de cartes entre listes (filter=updateCard:idList),
 * paginé (100 actions max par requête, jusqu'à 20 pages = 2000 déplacements).
 */
async function fetchListMoves(boardId, auth) {
  const all = [];
  for (let page = 0; page < 20; page++) {
    const batch = await trelloGet(`/boards/${boardId}/actions`, {
      ...auth,
      params: {
        filter: 'updateCard:idList',
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
