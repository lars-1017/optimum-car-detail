const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rssimtkrgsnlbmrxgdxy.supabase.co';
const READ_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_mYpPedEdizMJEz9qgGrbwg_Ift0ZbTS';

function parseAppointment(dateStr, timeStr) {
  if (!dateStr) return null;
  
  // Clean date to strict YYYY-MM-DD
  const cleanDate = String(dateStr).slice(0, 10);
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  // Extract time parts safely regardless of tags like "Shop Drop-Off" or "Mobile"
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(timeStr || ''));
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3].toUpperCase();

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  // Mountain Time to UTC conversion (+6 hours MDT)
  const dt = new Date(Date.UTC(year, month - 1, day, hours + 6, minutes));
  return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export default async () => {
  const query = `${SUPABASE_URL}/rest/v1/bookings?select=*&order=booking_date.desc`;

  try {
    const res = await fetch(query, {
      headers: { apikey: READ_KEY, Authorization: `Bearer ${READ_KEY}` }
    });
    const bookings = await res.json();

    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Optimum Car Detail//Booking System//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Optimum Car Detail Bookings'
    ];

    if (Array.isArray(bookings)) {
      bookings.forEach((b) => {
        const startUTC = parseAppointment(b.booking_date, b.booking_time);
        if (!startUTC) return;

        // Default appointment block: 2.5 hours
        const endObj = new Date(new Date(startUTC).getTime() + 2.5 * 60 * 60 * 1000);
        const endUTC = endObj.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        const client = b.client_name || 'Client';
        const vehicle = b.vehicle_info || 'Vehicle';
        const phone = b.client_phone || 'N/A';
        const notes = (b.notes || 'None').replace(/\n/g, ' ');

        ics.push(
          'BEGIN:VEVENT',
          `UID:booking-${b.id}@optimumcardetail.com`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
          `DTSTART:${startUTC}`,
          `DTEND:${endUTC}`,
          `SUMMARY:Detail: ${client} (${vehicle})`,
          `DESCRIPTION:Phone: ${phone}\\nNotes: ${notes}`,
          `STATUS:CONFIRMED`,
          'END:VEVENT'
        );
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
    return new Response('Error generating calendar feed', { status: 500 });
  }
};

export const config = { path: '/api/calendar' };
