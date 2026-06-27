'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';

export interface CalEvent {
  title: string;
  start: string;
  color?: string;
  url?: string;
}

// Combined community calendar — events + notifications + meetings, colour-coded.
// Like the app's calendar view (plan §5).
export function CommunityCalendar({ events }: { events: CalEvent[] }) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, listPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }}
      events={events}
      height="auto"
      eventDisplay="block"
    />
  );
}
