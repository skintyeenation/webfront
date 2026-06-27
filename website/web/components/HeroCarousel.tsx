'use client';

import Link from 'next/link';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';

export interface Slide {
  title: string;
  subtitle?: string;
  href?: string;
  gradient: string;
}

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
      {slides.map((s, i) => (
        <SwiperSlide key={i}>
          <div
            className="flex h-full flex-col justify-center px-8 text-white"
            style={{ background: s.gradient }}
          >
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
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
