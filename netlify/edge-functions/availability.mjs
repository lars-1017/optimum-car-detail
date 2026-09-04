// Returns which slots are already taken for a date range.
//
// This runs server-side on purpose: the browser must never be able to read the
// `bookings` table directly, because those rows hold customer names, phone
// numbers and home addresses. Only booking_date / booking_time / service_id are
// selected here, and only those three fields are returned.
//
// Set SUPABASE_SERVICE_ROLE_KEY in the Netlify site environment to let this
// function read bookings while the table stays unreadable to the public. Until
// then it falls back to the publishable key, which only works if `bookings`
// still allows public select. If neither can read, the response says
// `availabilityUnknown` and the booking page degrades to showing every slot.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rssimtkrgsnlbmrxgdxy.supabase.co';
const READ_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_mYpPedEdizMJEz9qgGrbwg_Ift0ZbTS';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to') || from;

  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
    return Response.json(
      { error: 'from/to must be YYYY-MM-DD dates' },
      { status: 400, headers: { 'cache-control': 'no-store' } }
    );
  }

  const query =
    `${SUPABASE_URL}/rest/v1/bookings` +
    `?select=booking_date,booking_time,service_id` +
    `&booking_date=gte.${from}&booking_date=lte.${to}`;

  try {
    const res = await fetch(query, {
      headers: { apikey: READ_KEY, Authorization: `Bearer ${READ_KEY}` },
    });

    if (!res.ok) {
      // Most likely cause: row-level security blocks select for this key.
      // Fail open rather than blocking bookings entirely.
      return Response.json(
        { availabilityUnknown: true, status: res.status },
        { status: 200, headers: { 'cache-control': 'no-store' } }
      );
    }

    const rows = await res.json();
    const bookings = (Array.isArray(rows) ? rows : []).map((r) => ({
      date: r.booking_date,
      time: r.booking_time,
      serviceId: r.service_id,
    }));

    return Response.json(
      { bookings },
      { status: 200, headers: { 'cache-control': 'no-store' } }
    );
  } catch (err) {
    return Response.json(
      { availabilityUnknown: true, error: String(err && err.message) },
      { status: 200, headers: { 'cache-control': 'no-store' } }
    );
  }
};

export const config = { path: '/api/availability' };
