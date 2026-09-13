function getEnv(key) {
  try {
    if (typeof Deno !== 'undefined' && Deno?.env?.get) return Deno.env.get(key);
  } catch (_) {}
  try {
    if (typeof Netlify !== 'undefined' && Netlify?.env?.get) return Netlify.env.get(key);
  } catch (_) {}
  try {
    if (typeof process !== 'undefined' && process?.env) return process.env[key];
  } catch (_) {}
  return null;
}

const SUPABASE_URL = getEnv('SUPABASE_URL') || 'https://rssimtkrgsnlbmrxgdxy.supabase.co';
const READ_KEY =
  getEnv('SUPABASE_SERVICE_ROLE_KEY') ||
  getEnv('SUPABASE_ANON_KEY') ||
  'sb_publishable_mYpPedEdizMJEz9qgGrbwg_Ift0ZbTS';

function formatICS(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function parseAppointmentDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const cleanDate = String(dateStr).slice(0, 10);
  const parts = cleanDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;

  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(timeStr || ''));
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3].toUpperCase();

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  // Mountain Time conversion: +6 hours MDT / +7 hours MST
  const isDST = month >= 3 && month <= 11;
  const offsetHours = isDST ? 6 : 7;

  return new Date(Date.UTC(year, month - 1, day, hours + offsetHours, minutes));
}

export default async () => {
  const query = `${SUPABASE_URL}/rest/v1/bookings?select=*&order=booking_date.desc`;

  try {
    const res = await fetch(query, {
      headers: {
        apikey: READ_KEY,
        Authorization: `Bearer ${READ_KEY}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase read failed (${res.status}): ${errText}`);
    }

    const bookings = await res.json();
    const nowUTC = formatICS(new Date());

    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Optimum Car Detail//Booking System//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Optimum Car Detail Bookings',
      'X-WR-TIMEZONE:America/Denver'
    ];

    if (Array.isArray(bookings)) {
      bookings.forEach((b) => {
        try {
          const startDate = parseAppointmentDate(b.booking_date, b.booking_time);
          if (!startDate || isNaN(startDate.getTime())) return;

          const endDate = new Date(startDate.getTime() + 2.5 * 60 * 60 * 1000);
          const startUTC = formatICS(startDate);
          const endUTC = formatICS(endDate);

          // Extract service/package details
          const service = (b.service_name || b.service || b.package || 'Detail Service').replace(/[\\,;]/g, ' ');
          const client = (b.client_name || 'Client').replace(/[\\,;]/g, ' ');
          const vehicle = (b.vehicle_info || 'Vehicle').replace(/[\\,;]/g, ' ');
          const phone = (b.client_phone || 'N/A').replace(/[\\,;]/g, ' ');
          const notes = String(b.notes || 'None').replace(/[\r\n]+/g, ' ').replace(/[\\,;]/g, ' ');

          ics.push(
            'BEGIN:VEVENT',
            `UID:booking-${b.id || Math.random().toString(36).slice(2)}@optimumcardetail.com`,
            `DTSTAMP:${nowUTC}`,
            `DTSTART:${startUTC}`,
            `DTEND:${endUTC}`,
            `SUMMARY:${service}: ${client} (${vehicle})`,
            `DESCRIPTION:Service: ${service}\\nPhone: ${phone}\\nNotes: ${notes}`,
            `STATUS:CONFIRMED`,
            'END:VEVENT'
          );
        } catch (_) {}
      });
    }

    ics.push('END:VCALENDAR');

    return new Response(ics.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (err) {
    return new Response(`Error generating calendar feed: ${err?.message || err}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};

export const config = { path: '/api/calendar' };
