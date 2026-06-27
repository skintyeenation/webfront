// Skin Tyee Resorts — placeholder hotels. Names are BC-themed; photos are
// hand-picked Unsplash imagery (stable URLs, visually verified per resort).
// Swap for real listings/photos later.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop&q=70`;
const RESORTS = [
  { name: 'Francois Lake Lodge', location: 'Francois Lake, BC', image: U('1591134106086-fb978ec70677') },
  { name: 'Nadina Mountain Resort', location: 'Houston, BC', image: U('1626684496076-07e23c6361ff') },
  { name: 'Ootsa Lake Chalet', location: 'Ootsa Lake, BC', image: U('1629165912554-91ca12307393') },
  { name: 'Cheslatta Falls Inn', location: 'Grassy Plains, BC', image: U('1493713838217-28e23b41b798') },
  { name: 'Tahtsa Reach Retreat', location: 'Tweedsmuir, BC', image: U('1631764884113-f7d7a15d9b3a') },
  { name: 'Babine Forest Lodge', location: 'Burns Lake, BC', image: U('1570793005386-840846445fed') },
];

export function ResortsSection() {
  return (
    <section>
      <h2 className="text-xl font-bold">Skin Tyee Resorts</h2>
      <p className="mt-1 text-ink/70">Community hospitality across northern British Columbia. Stay at Skin Tyee Resorts!</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {RESORTS.map((r) => (
          <div key={r.name} className="overflow-hidden rounded-xl border border-[var(--line)] transition hover:shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.image}
              alt={r.name}
              width={600}
              height={400}
              loading="lazy"
              className="h-44 w-full object-cover"
            />
            <div className="p-4">
              <h3 className="font-semibold text-ink">{r.name}</h3>
              <p className="text-sm text-ink/60">{r.location}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
