import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

/* Inter is self-hosted by next/font at build time: no runtime network request. The Simple view's
 * own CSS reads it through --font-inter; the Console view keeps the system stack untouched. */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'UsageLedger',
  description: 'Tokens used by Claude Code and Codex on this computer, per day, per model, per repo and per session.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
