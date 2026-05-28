const SUPABASE_URL = 'https://ktpyqsywskwcwanlcukr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-prx0KtYuJIjWb0BnxcB1w_vbo26tl4';
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

const MEMBERS = ['Seba', 'Fran', 'Sayen', 'Mati'];

function getWeekDates() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default async function handler(req, res) {
  try {
    const weekDates = getWeekDates();

    // Who is already signed up this week?
    const sbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/almuerzo_assignments?date=in.(${weekDates.join(',')})&select=member_name`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const assignments = await sbRes.json();
    const signedUp = new Set(assignments.map(a => a.member_name));

    const notSignedUp = MEMBERS.filter(m => !signedUp.has(m));

    if (notSignedUp.length === 0) {
      return res.status(200).json({ sent: 0, message: 'Todos anotados' });
    }

    // Send one notification per unsigned member, filtered by OneSignal tag
    const results = await Promise.all(notSignedUp.map(name =>
      fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${ONESIGNAL_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          filters: [{ field: 'tag', key: 'user', relation: '=', value: name }],
          headings: { es: 'Depto 🍽️' },
          contents: { es: `${name}, aún no te anotaste para hacer almuerzo esta semana. ¡Elige un día!` },
          url: 'https://depto-app.vercel.app/almuerzo.html',
        }),
      }).then(r => r.json())
    ));

    return res.status(200).json({ sent: notSignedUp.length, notSignedUp, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
