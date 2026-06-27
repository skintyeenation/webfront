import { publicApi, safe } from '@/lib/api';
import { getPostsByCategory } from '@/lib/wp';
import { getSession, onboardingUrl } from '@/lib/session';
import { NOTIFICATION_COLORS } from '@/lib/constants';
import { HeroCarousel, type Slide } from '@/components/HeroCarousel';
import { MajorProjectsParallax } from '@/components/MajorProjectsParallax';
import { CommunityCalendar, type CalEvent } from '@/components/CommunityCalendar';
import { NotificationItem, EventCard, MeetingItem } from '@/components/cards';
import { OnboardingCta } from '@/components/OnboardingCta';

export const revalidate = 60;

export default async function Home() {
  const [notifications, events, meetings, projects, session] = await Promise.all([
    safe(publicApi.notifications.list(), []),
    safe(publicApi.events.list(), []),
    safe(publicApi.meetings.list(), []),
    getPostsByCategory('major-projects', 3),
    getSession(),
  ]);

  const slides: Slide[] = [
    {
      title: 'Welcome to Skin Tyee First Nation',
      subtitle: 'Community news, events, programs, and services.',
      href: '/programs',
      gradient: 'linear-gradient(135deg,#00343f 0%,#00B8EC 100%)',
    },
    ...events.slice(0, 2).map((e): Slide => ({
      title: e.title,
      subtitle: e.location,
      href: '/',
      gradient: 'linear-gradient(135deg,#1d4b1d 0%,#9ECD3B 100%)',
    })),
  ];

  const calEvents: CalEvent[] = [
    ...events.map((e) => ({ title: e.title, start: e.startsAt, color: '#00B8EC' })),
    ...meetings.map((m) => ({ title: m.title, start: m.startsAt, color: '#EC6A37' })),
    ...notifications.map((n) => ({ title: n.title, start: n.createdAt, color: NOTIFICATION_COLORS[n.category] ?? '#90A4AE' })),
  ];

  return (
    <div className="space-y-12">
      <HeroCarousel slides={slides} />

      {session && <OnboardingCta url={onboardingUrl()} />}

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold">Notifications</h2>
          <div className="mt-2">
            {notifications.length ? (
              notifications.map((n) => <NotificationItem key={n._id} n={n} />)
            ) : (
              <p className="text-ink/60">No current notices.</p>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold">Upcoming events</h2>
          <div className="mt-3 space-y-3">
            {events.length ? (
              events.map((e) => <EventCard key={e._id} e={e} />)
            ) : (
              <p className="text-ink/60">No upcoming events.</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Meetings</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {meetings.length ? (
            meetings.map((m) => <MeetingItem key={m._id} m={m} />)
          ) : (
            <p className="text-ink/60">No public meetings scheduled.</p>
          )}
        </div>
      </section>

      <MajorProjectsParallax projects={projects} />

      <section>
        <h2 className="text-xl font-bold">Community calendar</h2>
        <div className="mt-3">
          <CommunityCalendar events={calEvents} />
        </div>
      </section>
    </div>
  );
}
