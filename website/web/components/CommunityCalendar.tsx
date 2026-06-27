'use client';

import { useEffect, useRef } from 'react';
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
// Defaults to the list view on mobile (the month grid is squashed on phones).
export function CommunityCalendar({ events }: { events: CalEvent[] }) {
  const ref = useRef<FullCalendar>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      ref.current?.getApi()?.changeView('listMonth');
    }
  }, []);

  return (
    <FullCalendar
      ref={ref}
      plugins={[dayGridPlugin, listPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }}
      events={events}
      height="auto"
      eventDisplay="block"
    />
  );
}
