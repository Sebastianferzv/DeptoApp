const SUPABASE_URL = 'https://ktpyqsywskwcwanlcukr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-prx0KtYuJIjWb0BnxcB1w_vbo26tl4';
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

const MEMBERS = ['Seba', 'Fran', 'Sayen', 'Mati'];

function getThisMonday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  if (day === 0) {
    today.setDate(today.getDate() + 1);
    return today;
  }
  today.setDate(today.getDate() - (day - 1));
  return today;
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function weeksBetween(a, b) {
  return Math.round((b - a) / (7 * 24 * 60 * 60 * 1000));
}

function getResponsible(task, monday) {
  const start = new Date(task.start_date);
  start.setHours(0, 0, 0, 0);
  const diff = weeksBetween(start, monday);
  if (diff < 0 || diff % task.interval_weeks !== 0) return null;
  const slot = Math.floor(diff / task.interval_weeks) % MEMBERS.length;
  return MEMBERS[(task.start_person_index + slot) % MEMBERS.length];
}

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function sendPush(memberName, contentEn, contentEs) {
  return fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      filters: [{ field: 'tag', key: 'user', relation: '=', value: memberName }],
      headings: { en: 'Depto', es: 'Depto' },
      contents: { en: contentEn, es: contentEs },
      url: 'https://depto-app.vercel.app/tareas.html',
      priority: 10,
      content_available: true,
      mutable_content: true,
    }),
  }).then(r => r.json());
}

export default async function handler(req, res) {
  try {
    const monday = getThisMonday();
    const mondayStr = toDateStr(monday);
    const isThursday = new Date().getDay() === 4;

    const [tasks, completions] = await Promise.all([
      sbFetch('tareas?select=*&order=created_at'),
      sbFetch('task_completions?select=task_id,week_date'),
    ]);

    const doneKeys = new Set(completions.map(c => `${c.task_id}_${c.week_date}`));
    const toNotify = [];

    // Current week pending — only on Thursdays, same as before
    if (isThursday) {
      for (const task of tasks) {
        if (doneKeys.has(`${task.id}_${mondayStr}`)) continue;
        const responsible = getResponsible(task, monday);
        if (responsible) {
          toNotify.push({
            name: responsible,
            en: `${responsible}, you have a pending task this week: ${task.name}`,
            es: `${responsible}, aún tienes una tarea pendiente esta semana: ${task.name}`,
          });
        }
      }
    }

    // Overdue past weeks — every day
    const seen = new Set();
    for (let w = 1; w <= 12; w++) {
      const prevMon = new Date(monday);
      prevMon.setDate(monday.getDate() - w * 7);
      const prevStr = toDateStr(prevMon);
      for (const task of tasks) {
        if (seen.has(task.id)) continue;
        const responsible = getResponsible(task, prevMon);
        if (responsible && !doneKeys.has(`${task.id}_${prevStr}`)) {
          seen.add(task.id);
          toNotify.push({
            name: responsible,
            en: `${responsible}, you have an overdue task: ${task.name}`,
            es: `${responsible}, tienes una tarea atrasada: ${task.name}`,
          });
        }
      }
    }

    if (toNotify.length === 0) {
      return res.status(200).json({ sent: 0, message: 'Sin tareas pendientes ni atrasadas' });
    }

    const results = await Promise.all(toNotify.map(({ name, en, es }) => sendPush(name, en, es)));
    return res.status(200).json({ sent: toNotify.length, toNotify, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
