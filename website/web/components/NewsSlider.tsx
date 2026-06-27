'use client';

import Link from 'next/link';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { NOTIFICATION_COLORS } from '@/lib/constants';
import 'swiper/css';
import 'swiper/css/pagination';

export interface NewsArticle {
  title: string;
  excerpt: string;
  date: string;
  category: string;
  image: string;
  href: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const catColor = (c: string) => NOTIFICATION_COLORS[c] ?? '#5C6BC0';

// Primary "mini hero" — autoplaying slider that rotates the news articles.
export function NewsSlider({ articles }: { articles: NewsArticle[] }) {
  return (
    <Swiper
      modules={[Autoplay, Pagination]}
      autoplay={{ delay: 8000, disableOnInteraction: false }}
      speed={900}
      pagination={{ clickable: true }}
      loop={articles.length > 1}
      className="h-[400px] overflow-hidden rounded-xl"
    >
      {articles.map((a, i) => (
        <SwiperSlide key={i}>
          <Link href={a.href} className="relative block h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.8) 100%)' }} />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: catColor(a.category) }}>
                {a.category}
              </span>
              <h3 className="mt-1 text-2xl font-bold drop-shadow">{a.title}</h3>
              <p className="mt-1 line-clamp-2 max-w-2xl text-white/85">{a.excerpt}</p>
              <span className="mt-2 inline-block text-xs text-white/70">{fmt(a.date)}</span>
            </div>
          </Link>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
