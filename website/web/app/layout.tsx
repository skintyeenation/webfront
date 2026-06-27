import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Skin Tyee First Nation',
    template: '%s · Skin Tyee First Nation',
  },
  description: 'Skin Tyee First Nation — community news, events, and information.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">Skin Tyee First Nation</Link>
          <nav>
            <Link href="/">News</Link>
            <Link href="/welcome">About</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          © {new Date().getFullYear()} Skin Tyee First Nation
        </footer>
      </body>
    </html>
  );
}
