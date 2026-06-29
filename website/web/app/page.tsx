import { publicApi, safe } from '@/lib/api';
import { getSession, onboardingUrl } from '@/lib/session';
import { NOTIFICATION_COLORS } from '@/lib/constants';
import { HeroCarousel, type Slide } from '@/components/HeroCarousel';
import { MajorProjectsParallax } from '@/components/MajorProjectsParallax';
import { NewsSection } from '@/components/NewsSection';
import { CustomBanners } from '@/components/CustomBanners';
import { ConstructionNotice } from '@/components/ConstructionNotice';
import { CommunityCalendar, type CalEvent } from '@/components/CommunityCalendar';
import { NotificationItem, EventCard, MeetingItem } from '@/components/cards';
import { OnboardingCta } from '@/components/OnboardingCta';
import { AppDownloadCta } from '@/components/AppDownloadCta';
import { JobsCta } from '@/components/JobsCta';
import { ProgramsSection } from '@/components/ProgramsSection';
import { ResortsSection } from '@/components/ResortsSection';
import { PageHero } from '@/components/PageHero';

export const revalidate = 60;

export default async function Home() {
  const [notifications, events, meetings, session] = await Promise.all([
    safe(publicApi.notifications.list(), []),
    safe(publicApi.events.list(), []),
    safe(publicApi.meetings.list(), []),
    getSession(),
  ]);

  const slides: Slide[] = [
    {
      title: 'Welcome to Skin Tyee First Nation',
      subtitle: 'Community news, events, programs, and services.',
      href: '/programs',
      gradient: 'linear-gradient(135deg,#00343f 0%,#00B8EC 100%)',
    },
    // Cycle through the system notifications — slide bg is the category colour
    // (same colour they're coded with in the sidebar list).
    ...notifications.map((n): Slide => {
      const color = NOTIFICATION_COLORS[n.category] ?? '#5C6BC0';
      return {
        title: n.title,
        subtitle: n.body,
        gradient: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 62%, #04222a) 100%)`,
      };
    }),
  ];

  // Combined calendar — events + meetings + notifications, colour-coded (like the app).
  const calEvents: CalEvent[] = [
    ...events.map((e) => ({ title: e.title, start: e.startsAt, color: '#00B8EC' })),
    ...meetings.map((m) => ({ title: m.title, start: m.startsAt, color: '#EC6A37' })),
    ...notifications.map((n) => ({ title: n.title, start: n.createdAt, color: NOTIFICATION_COLORS[n.category] ?? '#90A4AE' })),
  ];

  return (
    <>
      <PageHero
        title="Skin Tyee Nation"
        subtitle={
          <>
            A proud <strong className="font-semibold text-white">Wet&apos;suwet&apos;en</strong>{' '}
            <span className="whitespace-nowrap italic text-white/70">(wet-SOO-wet-en)</span> community on the shores of Francois
            Lake in northern British Columbia.
            {/* "For countless generations…" — tablet + desktop only (hidden on mobile to keep the hero short). */}
            <span className="hidden md:inline">
              {' '}For <em>countless generations</em>, we have stewarded these lands and waters and carried forward the
              Witsuwit&apos;en language, laws, and way of life — honouring our ancestors and building for the generations
              still to come.
            </span>
          </>
        }
      />
      <ConstructionNotice />
      <div className="space-y-10">
        <NewsSection />
        <CustomBanners />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT — hero + community calendar (like the app's calendar view) */}
        <div className="min-w-0 space-y-8">
          <HeroCarousel slides={slides} />
          {session && <OnboardingCta url={onboardingUrl()} />}
          <section>
            <h2 className="mb-3 text-xl font-bold">Community calendar</h2>
            <CommunityCalendar events={calEvents} />
          </section>
        </div>

        {/* RIGHT — list of items */}
        <aside className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-bold">Notifications</h2>
            {notifications.length ? (
              notifications.map((n) => <NotificationItem key={n._id} n={n} />)
            ) : (
              <p className="text-ink/60">No current notices.</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Upcoming events</h2>
            <div className="space-y-3">
              {events.length ? (
                events.map((e) => <EventCard key={e._id} e={e} />)
              ) : (
                <p className="text-ink/60">No upcoming events.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Meetings</h2>
            <div className="space-y-3">
              {meetings.length ? (
                meetings.map((m) => <MeetingItem key={m._id} m={m} />)
              ) : (
                <p className="text-ink/60">No public meetings scheduled.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <ProgramsSection />

      <MajorProjectsParallax />

      <ResortsSection />

      <JobsCta />

      <div className="py-12">
        <AppDownloadCta />
      </div>
      </div>
    </>
  );
}
