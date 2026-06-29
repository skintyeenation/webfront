'use client';

import Link from 'next/link';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import {
  Droplet,
  Flame,
  CalendarDays,
  Landmark,
  LayoutGrid,
  Newspaper,
  Megaphone,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import 'swiper/css';
import 'swiper/css/pagination';

export interface Slide {
  title: string;
  subtitle?: string;
  href?: string;
  gradient: string;
  category?: string;
}

// Notification category → overlay icon (all generic lucide vectors).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Health: Droplet, // water boil advisory
  Safety: Flame, // wildfire / evacuation
  Events: CalendarDays, // community events
  Council: Landmark,
  Programs: LayoutGrid,
  News: Newspaper,
  Announcements: Megaphone,
};

export function HeroCarousel({ slides }: { slides: Slide[] }) {
  return (
    <Swiper
      modules={[Autoplay, Pagination]}
      autoplay={{ delay: 8000, disableOnInteraction: false }}
      speed={900}
      pagination={{ clickable: true }}
      loop={slides.length > 1}
      className="h-[360px] rounded-xl overflow-hidden"
    >
      {slides.map((s, i) => {
        const Icon = s.category ? CATEGORY_ICONS[s.category] : undefined;
        return (
          <SwiperSlide key={i}>
            <div
              className="relative flex h-full flex-col justify-center overflow-hidden px-8 text-white"
              style={{ background: s.gradient }}
            >
              {Icon && (
                <Icon
                  aria-hidden="true"
                  className="pointer-events-none absolute right-6 top-1/2 h-44 w-44 -translate-y-1/2 text-white/20 sm:right-12 sm:h-52 sm:w-52"
                  strokeWidth={1.5}
                />
              )}
              <div className="relative z-10">
                <h2 className="text-3xl font-bold drop-shadow-sm">{s.title}</h2>
                {s.subtitle && <p className="mt-2 max-w-xl text-white/90">{s.subtitle}</p>}
                {s.href && (
                  <Link
                    href={s.href}
                    className="mt-5 inline-block w-fit rounded bg-white px-4 py-2 font-semibold text-ink hover:bg-white/90"
                  >
                    Learn more →
                  </Link>
                )}
              </div>
            </div>
          </SwiperSlide>
        );
      })}
    </Swiper>
  );
}
