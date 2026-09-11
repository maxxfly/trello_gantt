// Données de démonstration : simulent une réponse de l'API Trello
// pour visualiser le Gantt sans token (bouton « Démo »).

const now = new Date();
const iso = (d) => d.toISOString();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);
const daysAhead = (n) => new Date(now.getTime() + n * 86400000);

const members = [
  { id: 'm1', username: 'alice', fullName: 'Alice Martin', initials: 'AM', avatarUrl: '' },
  { id: 'm2', username: 'bruno', fullName: 'Bruno Durand', initials: 'BD', avatarUrl: '' },
  { id: 'm3', username: 'chloe', fullName: 'Chloé Bernard', initials: 'CB', avatarUrl: '' },
  { id: 'm4', username: 'david', fullName: 'David Petit', initials: 'DP', avatarUrl: '' },
];

const lists = [
  { id: 'l1', name: 'À faire', pos: 1 },
  { id: 'l2', name: 'En cours', pos: 2 },
  { id: 'l3', name: 'En revue', pos: 3 },
  { id: 'l4', name: 'Terminé', pos: 4 },
];

const checklistsById = {
  c1: {
    id: 'c1',
    checkItems: [
      { name: 'Maquettes', state: 'complete', pos: 1 },
      { name: 'Intégration', state: 'incomplete', pos: 2 },
      { name: 'Tests', state: 'incomplete', pos: 3 },
    ],
  },
  c2: {
    id: 'c2',
    checkItems: [
      { name: 'Schéma BDD', state: 'complete', pos: 1 },
      { name: 'API REST', state: 'unknown', pos: 2 },
      { name: 'Cache', state: 'incomplete', pos: 3 },
    ],
  },
  c3: {
    id: 'c3',
    checkItems: [
      { name: 'Rédaction', state: 'complete', pos: 1 },
      { name: 'Relecture', state: 'unknown', pos: 2 },
    ],
  },
  c4: {
    id: 'c4',
    checkItems: [
      { name: 'Audit sécurité', state: 'complete', pos: 1 },
      { name: 'Correctifs', state: 'complete', pos: 2 },
      { name: 'Déploiement', state: 'complete', pos: 3 },
    ],
  },
  c5: {
    id: 'c5',
    checkItems: [
      { name: 'Wireframes', state: 'complete', pos: 1 },
      { name: 'Design system', state: 'complete', pos: 2 },
      { name: 'Prototypage', state: 'unknown', pos: 3 },
      { name: 'Validation', state: 'incomplete', pos: 4 },
    ],
  },
};

const cards = [
  { id: 'card1', name: 'Refonte de la page d’accueil', idList: 'l2', start: iso(daysAgo(12)), due: iso(daysAhead(6)), idMembers: ['m1', 'm2'], idChecklists: ['c5'], closed: false },
  { id: 'card2', name: 'API de facturation', idList: 'l2', start: iso(daysAgo(8)), due: iso(daysAhead(10)), idMembers: ['m3'], idChecklists: ['c2'], closed: false },
  { id: 'card3', name: 'Migration base de données', idList: 'l1', start: iso(daysAgo(2)), due: iso(daysAhead(18)), idMembers: ['m3', 'm4'], idChecklists: ['c1'], closed: false },
  { id: 'card4', name: 'Documentation utilisateur', idList: 'l3', start: iso(daysAgo(20)), due: iso(daysAgo(1)), idMembers: ['m4'], idChecklists: ['c3'], closed: false },
  { id: 'card5', name: 'Audit de sécurité', idList: 'l4', start: iso(daysAgo(30)), due: iso(daysAgo(12)), idMembers: ['m1', 'm2', 'm3', 'm4'], idChecklists: ['c4'], closed: false },
  { id: 'card6', name: 'Onboarding nouvelle équipe', idList: 'l1', start: iso(daysAgo(1)), due: iso(daysAhead(4)), idMembers: ['m2'], idChecklists: [], closed: false },
  { id: 'card7', name: 'Plan marketing Q4', idList: 'l3', start: iso(daysAgo(5)), due: iso(daysAhead(3)), idMembers: ['m1'], idChecklists: [], closed: false },
];

export function getDemoData() {
  return {
    board: { id: 'demo', name: 'Projet Alpha (démo)' },
    lists,
    cards,
    members,
    checklistsById,
  };
}
