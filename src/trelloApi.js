// Client pour l'API REST de Trello (https://developer.atlassian.com/cloud/trello/rest/)
// Requêtes GET en JSON, authentification via les paramètres d'URL « key » (clé d'API)
// et « token » (token utilisateur). Le « secret » du Power-Up ne sert pas ici
// (il est réservé à OAuth 1.0 et aux webhooks).

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
        `Token refusé par Trello (${res.status}) : vérifiez que le champ « Token utilisateur » contient bien un token obtenu via « Obtenir le token » (trello.com/1/authorize) et NON le « Secret » de trello.com/power-ups/admin.${detail ? ' ' + detail : ''}`
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
 * le tableau (avec listes + membres), les cartes et les checklists (étapes).
 * @param {string} boardInput - URL ou ID du tableau
 * @param {string} token - token utilisateur Trello (obtenu via /1/authorize)
 * @param {string} [apiKey] - clé d'API « key » du Power-Up (optionnelle pour l'usage personnel)
 */
export async function fetchBoardData(boardInput, token, apiKey = '') {
  if (!token || !token.trim()) throw new Error('Le champ « Token utilisateur » est vide.');
  const boardId = extractBoardId(boardInput);
  const auth = { apiKey: apiKey.trim(), token: token.trim() };

  const [board, cards, checklists] = await Promise.all([
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
        fields: 'id,name,start,due,idList,idMembers,closed,pos,idChecklists',
      },
    }),
    // Seule cette endpoint renvoie l'état (state) de chaque item (= étape).
    trelloGet(`/boards/${boardId}/checklists`, {
      ...auth,
      params: { checkItems: 'all' },
    }),
  ]);

  const lists = (board.lists || []).filter((l) => !l.closed);
  const members = board.members || [];
  const checklistsById = {};
  for (const cl of checklists || []) checklistsById[cl.id] = cl;

  return { board, lists, cards, members, checklistsById };
}
