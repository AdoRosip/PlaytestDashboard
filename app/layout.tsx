import type { Metadata, Viewport } from 'next';
import './globals.css';

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
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
