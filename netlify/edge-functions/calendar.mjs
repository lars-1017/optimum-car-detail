const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rssimtkrgsnlbmrxgdxy.supabase.co';
const READ_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_mYpPedEdizMJEz9qgGrbwg_Ift0ZbTS';

function formatICSDate(dateStr, timeStr) {
  const dateParts = dateStr.split('-');
  let [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  // Converts to UTC (Mountain Daylight Time is UTC-6)
  const dt = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], hours + 6, minutes));
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
        try {
          const rawTime = (b.booking_time || '').replace(/[^0-9:AMP ]/gi, '').trim();
          const startUTC = formatICSDate(b.booking_date, rawTime);

          const endObj = new Date(new Date(startUTC).getTime() + 2.5 * 60 * 60 * 1000);
          const endUTC = endObj.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

          ics.push(
            'BEGIN:VEVENT',
            `UID:booking-${b.id}@optimumcardetail.com`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
            `DTSTART:${startUTC}`,
            `DTEND:${endUTC}`,
            `SUMMARY:Detail: ${b.client_name} (${b.vehicle_info || 'Vehicle'})`,
            `DESCRIPTION:Phone: ${b.client_phone}\\nEmail: ${b.client_email}\\nNotes: ${b.notes || 'None'}`,
            `STATUS:CONFIRMED`,
            'END:VEVENT'
          );
        } catch (e) {
          // Ignore malformed rows
        }
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
