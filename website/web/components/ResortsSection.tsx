// Skin Tyee Resorts — placeholder hotels with random BC-themed names + random
// photos (Lorem Picsum, deterministic per seed). Swap for real listings/photos
// later.
const RESORTS = [
  { name: 'Francois Lake Lodge', location: 'Francois Lake, BC', seed: 'francois-lake-lodge' },
  { name: 'Nadina Mountain Resort', location: 'Houston, BC', seed: 'nadina-mountain-resort' },
  { name: 'Ootsa Lake Chalet', location: 'Ootsa Lake, BC', seed: 'ootsa-lake-chalet' },
  { name: 'Cheslatta Falls Inn', location: 'Grassy Plains, BC', seed: 'cheslatta-falls-inn' },
  { name: 'Tahtsa Reach Retreat', location: 'Tweedsmuir, BC', seed: 'tahtsa-reach-retreat' },
  { name: 'Babine Forest Lodge', location: 'Burns Lake, BC', seed: 'babine-forest-lodge' },
];

export function ResortsSection() {
  return (
    <section>
      <h2 className="text-xl font-bold">Skin Tyee Resorts</h2>
      <p className="mt-1 text-ink/70">Community hospitality across northern British Columbia. Stay at Skin Tyee Resorts!</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {RESORTS.map((r) => (
          <div key={r.seed} className="overflow-hidden rounded-xl border border-[var(--line)] transition hover:shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://picsum.photos/seed/${r.seed}/600/400`}
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
