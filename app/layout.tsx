import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';

// Three type roles, exposed to Tailwind as CSS variables in globals.css:
//   Outfit          logo + headings (600–800)
//   Instrument Sans body / UI text
//   JetBrains Mono  data, numbers, uppercase labels (tabular numerals)
// All three are variable fonts, so no `weight` is requested — the full axis ships.
const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Playlytix Dashboard',
  description: 'Interactive playtest feedback analysis for game studios',
};

// Next sets a device-width viewport by default; declared explicitly so the
// theme colour matches the app background in mobile browser chrome.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1021',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full ${outfit.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
