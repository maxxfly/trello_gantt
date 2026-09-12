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

// Étiquettes aux couleurs Trello « officielles ».
const labels = [
  { id: 'lb1', name: 'Urgent', color: '#EB5A46' },
  { id: 'lb2', name: 'Backend', color: '#0079BF' },
  { id: 'lb3', name: 'Frontend', color: '#61BD4F' },
  { id: 'lb4', name: 'Dette technique', color: '#FFAB4A' },
  { id: 'lb5', name: 'Doc', color: '#C377E0' },
];

const cards = [
  { id: '66f1a2b3c4d5e6f7a8b9c0d1', shortLink: 'demoAAAA', name: 'Refonte de la page d’accueil', idList: 'l2', start: iso(daysAgo(12)), due: iso(daysAhead(6)), idMembers: ['m1', 'm2'], idMemberCreator: 'm1', idLabels: ['lb3', 'lb1'], closed: false },
  { id: '66f8b3c4d5e6f7a8b9c0d1e2', shortLink: 'demoBBBB', name: 'API de facturation', idList: 'l2', start: iso(daysAgo(8)), due: iso(daysAhead(10)), idMembers: ['m3'], idMemberCreator: 'm3', idLabels: ['lb2'], closed: false },
  { id: '6702c4d5e6f7a8b9c0d1e2f3', shortLink: 'demoCCCC', name: 'Migration base de données', idList: 'l1', start: iso(daysAgo(2)), due: iso(daysAhead(18)), idMembers: ['m3', 'm4'], idMemberCreator: 'm4', idLabels: ['lb2', 'lb4'], closed: false },
  { id: '66d1d5e6f7a8b9c0d1e2f3a4', shortLink: 'demoDDDD', name: 'Documentation utilisateur', idList: 'l3', start: iso(daysAgo(20)), due: iso(daysAgo(1)), idMembers: ['m4'], idMemberCreator: 'm2', idLabels: ['lb5'], closed: false },
  { id: '66b3e6f7a8b9c0d1e2f3a4b5', shortLink: 'demoEEEE', name: 'Audit de sécurité', idList: 'l4', start: iso(daysAgo(30)), due: iso(daysAgo(12)), idMembers: ['m1', 'm2', 'm3', 'm4'], idMemberCreator: 'm1', idLabels: ['lb4', 'lb1'], closed: false },
  { id: '670ae7f8a8b9c0d1e2f3a4b5', shortLink: 'demoFFFF', name: 'Onboarding nouvelle équipe', idList: 'l1', start: iso(daysAgo(1)), due: iso(daysAhead(4)), idMembers: ['m2'], idMemberCreator: 'm4', idLabels: [], closed: false },
  { id: '6705f8a9b9c0d1e2f3a4b5c6', shortLink: 'demoGGGG', name: 'Plan marketing Q4', idList: 'l3', start: iso(daysAgo(5)), due: iso(daysAhead(3)), idMembers: ['m1'], idMemberCreator: 'm1', idLabels: ['lb5'], closed: false },
  { id: '6692a1b2c3d4e5f6a7b8c9d0', shortLink: 'demoHHHH', name: 'Correctif paiement dupliqué', idList: 'l4', start: iso(daysAgo(45)), due: iso(daysAgo(38)), idMembers: ['m2'], idMemberCreator: 'm3', idLabels: ['lb1', 'lb2'], closed: true },
  { id: '6680b2c3d4e5f6a7b8c9d0e1', shortLink: 'demoIIII', name: 'Migration vers l’API v2', idList: 'l4', start: iso(daysAgo(60)), due: iso(daysAgo(41)), idMembers: ['m3', 'm4'], idMemberCreator: 'm2', idLabels: ['lb2', 'lb4'], closed: true },
  { id: '6671c3d4e5f6a7b8c9d0e1f2', shortLink: 'demoJJJJ', name: 'Refonte des e-mails transactionnels', idList: 'l3', start: iso(daysAgo(52)), due: iso(daysAgo(30)), idMembers: ['m1'], idMemberCreator: 'm4', idLabels: ['lb3'], closed: true },
];

// Historique des changements de colonne (simule les actions updateCard:idList).
// { date, listBefore, listAfter } triés du plus ancien au plus récent.
const movesByCardId = {
  '66f1a2b3c4d5e6f7a8b9c0d1': [
    { date: daysAgo(12), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(4), listBefore: 'l2', listAfter: 'l3' },
    { date: daysAgo(1), listBefore: 'l3', listAfter: 'l2' }, // retour en arrière
  ],
  '66f8b3c4d5e6f7a8b9c0d1e2': [
    { date: daysAgo(6), listBefore: 'l1', listAfter: 'l2' },
  ],
  '6702c4d5e6f7a8b9c0d1e2f3': [],
  '66d1d5e6f7a8b9c0d1e2f3a4': [
    { date: daysAgo(18), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(9), listBefore: 'l2', listAfter: 'l3' },
  ],
  '66b3e6f7a8b9c0d1e2f3a4b5': [
    { date: daysAgo(28), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(20), listBefore: 'l2', listAfter: 'l3' },
    { date: daysAgo(13), listBefore: 'l3', listAfter: 'l4' },
  ],
  '670ae7f8a8b9c0d1e2f3a4b5': [],
  '6705f8a9b9c0d1e2f3a4b5c6': [
    { date: daysAgo(3), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(1), listBefore: 'l2', listAfter: 'l3' },
  ],
  '6692a1b2c3d4e5f6a7b8c9d0': [
    { date: daysAgo(43), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(40), listBefore: 'l2', listAfter: 'l4' },
  ],
  '6680b2c3d4e5f6a7b8c9d0e1': [
    { date: daysAgo(55), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(48), listBefore: 'l2', listAfter: 'l3' },
    { date: daysAgo(42), listBefore: 'l3', listAfter: 'l4' },
  ],
  // Archivée sans jamais atteindre « Terminé » (derniere colonne) :
  '6671c3d4e5f6a7b8c9d0e1f2': [
    { date: daysAgo(50), listBefore: 'l1', listAfter: 'l2' },
    { date: daysAgo(38), listBefore: 'l2', listAfter: 'l3' },
  ],
};

// Dates d'archivage (action archiveCard), pour les cartes terminées hors de la
// derniere colonne : la barre doit finir a l'archivage, pas a la due date.
const archivedAtByCardId = {
  '6692a1b2c3d4e5f6a7b8c9d0': daysAgo(40),
  '6680b2c3d4e5f6a7b8c9d0e1': daysAgo(42),
  '6671c3d4e5f6a7b8c9d0e1f2': daysAgo(33), // entree en revue a -38j -> barre jusqu'a -33j
};

// Anciennes échéances (repoussées), simulées depuis updateCard:due/dueChanged.
const dueHistoryByCardId = {
  '66f1a2b3c4d5e6f7a8b9c0d1': [
    { due: daysAhead(-9), changedAt: daysAgo(9) }, // repoussée une 1re fois
    { due: daysAhead(-2), changedAt: daysAgo(2) }, // puis une 2e -> due actuelle
  ],
  '66d1d5e6f7a8b9c0d1e2f3a4': [
    { due: daysAgo(15), changedAt: daysAgo(15) },
  ],
  '6705f8a9b9c0d1e2f3a4b5c6': [
    { due: daysAhead(-6), changedAt: daysAgo(6) },
  ],
};

export function getDemoData() {
  return {
    board: { id: 'demo', name: 'Projet Alpha (démo)' },
    lists,
    cards,
    members,
    labels,
    movesByCardId,
    dueHistoryByCardId,
    archivedAtByCardId,
  };
}
