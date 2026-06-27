// Skin Tyee Resorts — placeholder hotels. Names are BC-themed; photos are
// topical placeholders (LoremFlickr, keyword-matched + locked per resort so each
// shows the right scenery). Swap for real listings/photos later.
const RESORTS = [
  { name: 'Francois Lake Lodge', location: 'Francois Lake, BC', topic: 'lake', lock: 11 },
  { name: 'Nadina Mountain Resort', location: 'Houston, BC', topic: 'mountain', lock: 22 },
  { name: 'Ootsa Lake Chalet', location: 'Ootsa Lake, BC', topic: 'lake', lock: 33 },
  { name: 'Cheslatta Falls Inn', location: 'Grassy Plains, BC', topic: 'waterfall', lock: 44 },
  { name: 'Tahtsa Reach Retreat', location: 'Tweedsmuir, BC', topic: 'lake', lock: 55 },
  { name: 'Babine Forest Lodge', location: 'Burns Lake, BC', topic: 'forest', lock: 66 },
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
              src={`https://loremflickr.com/600/400/${r.topic}?lock=${r.lock}`}
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
