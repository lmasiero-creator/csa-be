/**
 * mock/data.js — In-memory data store for local development.
 *
 * All arrays are exported by reference so mutations in route handlers
 * are immediately visible to subsequent requests — just like a real DB.
 * Replace these with actual pg queries when the database is ready.
 */

const quotaOwners = [
  { id: 1, name: 'Marco',  surname: 'Rossi',   quota: 'quota_intera', email: 'marco.rossi@example.com',   phone_prefix: '+39', phone: '3331234567' },
  { id: 2, name: 'Giulia', surname: 'Bianchi',  quota: 'mezza_quota',  email: 'giulia.bianchi@example.com', phone_prefix: '+39', phone: '3339876543' },
  { id: 3, name: 'Luigi',  surname: 'Ferrari',  quota: 'quota_intera', email: 'luigi.ferrari@example.com',  phone_prefix: '+39', phone: '3355551234' },
  { id: 4, name: 'Sofia',  surname: 'Conti',    quota: 'mezza_quota',  email: 'sofia.conti@example.com',    phone_prefix: '+39', phone: '3371112233' },
];

// Events use absolute dates so they are always in the future relative to the
// project start date (March 2026). Adjust if needed.
const events = [
  { id: 1, date: '2026-04-05', type: 'inv', description: 'Raccolta piselli. Consiglio: porta l\'impermeabile', delivery_point: null, deadline: null },
  { id: 2, date: '2026-04-07', type: 'del', description: 'Consegna settimanale — Portello',  delivery_point: 'prt', deadline: '2026-04-05' },
  { id: 3, date: '2026-04-12', type: 'inv', description: 'Trapianto pomodori',                delivery_point: null, deadline: null },
  { id: 4, date: '2026-04-14', type: 'del', description: 'Consegna settimanale — Arcella',   delivery_point: 'arc', deadline: '2026-04-12' },
  { id: 5, date: '2026-04-15', type: 'evt', description: 'Assemblea soci',                    delivery_point: null, deadline: null },
  { id: 6, date: '2026-04-21', type: 'del', description: 'Consegna settimanale — Mirano',    delivery_point: 'mrn', deadline: '2026-04-19' },
  { id: 7, date: '2026-05-03', type: 'inv', description: 'Raccolta fragole',                  delivery_point: null, deadline: null },
  { id: 8, date: '2026-05-06', type: 'del', description: 'Consegna settimanale — Portello',  delivery_point: 'prt', deadline: '2026-05-04' },
];

const involvementSubscriptions = [
  {
    id: 1, event_id: 3, quota_owner_id: 1,
    participants: ['Marco Rossi', 'Anna Rossi'],
    duration: 'tutto il giorno',
    pranzo: 'Porto focaccia da condividere',
    mezzo_trasporto: 'macchina 4 posti',
  },
  {
    id: 2, event_id: 3, quota_owner_id: 2,
    participants: ['Giulia Bianchi'],
    duration: 'mattina',
    pranzo: null,
    mezzo_trasporto: null,
  },
];

const deliveryChanges = [
  {
    id: 1, event_id: 2, quota_owner_id: 3,
    new_delivery_point: 'arc',
    description: 'Al mio posto ritira mio fratello.',
  },
];

const accounts = [
  {
    id: 1, quota_owner_id: 1,
    description: 'Appassionato di agricoltura biologica.',
    photo_data: null,
  },
];

const recipients = [
  { id: 1, email: 'admin@csa-fattoria.it',    phone_prefix: '+39', phone: '3331234567' },
  { id: 2, email: 'co-admin@csa-fattoria.it', phone_prefix: '+39', phone: '3339876543' },
];

/** Return the next safe integer id for an array of records. */
function nextId(arr) {
  return arr.length > 0 ? Math.max(...arr.map((r) => r.id)) + 1 : 1;
}

module.exports = { quotaOwners, events, involvementSubscriptions, deliveryChanges, accounts, recipients, nextId };
