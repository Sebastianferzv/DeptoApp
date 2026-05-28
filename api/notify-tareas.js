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

async function sendPush(memberName, taskName) {
  return fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      filters: [{ field: 'tag', key: 'user', relation: '=', value: memberName }],
      headings: { es: 'Depto 📋' },
      contents: { es: `${memberName}, aún tienes una tarea pendiente esta semana: ${taskName}` },
      url: 'https://depto-app.vercel.app/tareas.html',
    }),
  }).then(r => r.json());
}

export default async function handler(req, res) {
  try {
    const monday = getThisMonday();
    const mondayStr = toDateStr(monday);

    const [tasks, completions] = await Promise.all([
      sbFetch('tareas?select=*&order=created_at'),
      sbFetch(`task_completions?week_date=eq.${mondayStr}&select=task_id`),
    ]);

    const doneTaskIds = new Set(completions.map(c => c.task_id));

    // Find which member has a pending task this week
    const toNotify = [];
    for (const task of tasks) {
      if (doneTaskIds.has(task.id)) continue;
      const responsible = getResponsible(task, monday);
      if (responsible) toNotify.push({ name: responsible, taskName: task.name });
    }

    if (toNotify.length === 0) {
      return res.status(200).json({ sent: 0, message: 'Todas las tareas completadas' });
    }

    const results = await Promise.all(toNotify.map(({ name, taskName }) => sendPush(name, taskName)));
    return res.status(200).json({ sent: toNotify.length, toNotify, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
