import { MapPin } from 'lucide-react';

// Skin Tyee Resorts — placeholder hotels. Names are BC-themed; photos are
// hand-picked Unsplash imagery (stable URLs, visually verified per resort).
// Addresses + Google ratings are placeholder/fake for now. Swap for real later.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop&q=70`;
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

const RESORTS = [
  { name: 'Francois Lake Lodge', address: '4821 Southbank Rd', location: 'Francois Lake, BC V0J 1X0', rating: 4.7, reviews: 213, image: U('1591134106086-fb978ec70677') },
  { name: 'Nadina Mountain Resort', address: '1190 Nadina Forest Service Rd', location: 'Houston, BC V0J 1Z0', rating: 4.2, reviews: 167, image: U('1626684496076-07e23c6361ff') },
  { name: 'Ootsa Lake Chalet', address: '7755 Ootsa Lake Rd', location: 'Ootsa Lake, BC V0J 1Y0', rating: 4.5, reviews: 98, image: U('1629165912554-91ca12307393') },
  { name: 'Cheslatta Falls Inn', address: '302 Cheslatta Falls Rd', location: 'Grassy Plains, BC V0J 1T0', rating: 3.9, reviews: 142, image: U('1493713838217-28e23b41b798') },
  { name: 'Tahtsa Reach Retreat', address: '60 Tahtsa Reach FSR', location: 'Tweedsmuir, BC V0J 2W0', rating: 3.8, reviews: 76, image: U('1631764884113-f7d7a15d9b3a') },
  { name: 'Babine Forest Lodge', address: '9410 Babine Lake Rd', location: 'Burns Lake, BC V0J 1E0', rating: 4.4, reviews: 189, image: U('1570793005386-840846445fed') },
];

// Fractional star row: a grey baseline with an amber overlay clipped to the rating.
function Stars({ rating }: { rating: number }) {
  return (
    <span className="relative inline-block leading-none" aria-hidden="true">
      <span className="text-gray-300">★★★★★</span>
      <span className="absolute left-0 top-0 overflow-hidden text-amber-400" style={{ width: `${(rating / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

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

              <a
                href={mapsUrl(`${r.name} reviews, ${r.address}, ${r.location}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1.5 text-sm hover:underline"
                aria-label={`${r.name} — ${r.rating} stars from ${r.reviews} Google reviews (new tab)`}
              >
                <span className="font-semibold text-ink">{r.rating.toFixed(1)}</span>
                <Stars rating={r.rating} />
                <span className="text-ink/50">({r.reviews})</span>
                <span className="ml-0.5 text-xs">
                  <span className="text-[#4285F4]">G</span>
                  <span className="text-[#EA4335]">o</span>
                  <span className="text-[#FBBC05]">o</span>
                  <span className="text-[#4285F4]">g</span>
                  <span className="text-[#34A853]">l</span>
                  <span className="text-[#EA4335]">e</span>
                  <span className="text-ink/45"> reviews</span>
                </span>
              </a>

              <a
                href={mapsUrl(`${r.name}, ${r.address}, ${r.location}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-2 inline-flex items-start gap-1.5 text-sm text-ink/60 hover:text-primary"
                aria-label={`Open ${r.name} in Google Maps (new tab)`}
              >
                <MapPin size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="group-hover:underline">
                  {r.address}
                  <br />
                  {r.location}
                </span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
