import type { Metadata } from 'next';
import NextTopLoader from 'nextjs-toploader';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import { Navigation } from '@/components/layout/navigation';
import { Footer } from '@/components/layout/footer';
import { SocketProvider } from '@/contexts/socket-provider';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/contexts/theme-provider';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const spaceMono = Space_Mono({
  variable: '--font-space-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  // Core Metadata
  title: {
    default: 'sideby.me - built by hermits, for recovering hermits',
    template: '%s - sideby.me',
  },
  description:
    'The ridiculously simple way to host watch parties. Create a room, share a link, and watch anything with friends in perfect sync. No sign-ups, no nonsense.',
  applicationName: 'sideby.me',
  // SEO
  keywords: ['watch party', 'watch together', 'video sync', 'no signup', 'sideby.me', 'realtime'],
  // Author & Brand
  authors: [{ name: 'whonoahexe', url: 'https://github.com/whonoahexe' }],
  creator: 'Noah',
  publisher: 'sideby.me',
  metadataBase: new URL('https://sideby.me'),
  icons: {
    icon: [
      {
        url: '/favicon-light.ico',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-dark.ico',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    shortcut: [
      {
        url: '/favicon-32x32-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-32x32-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/apple-touch-icon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    other: [{ rel: 'manifest', url: '/site.webmanifest' }],
  },
  // Open Graph Metadata
  openGraph: {
    title: 'sideby.me',
    description:
      'The ridiculously simple way to host watch parties. Create a room, share a link, and watch anything with friends in perfect sync.',
    url: new URL('https://sideby.me'),
    siteName: 'sideby.me',
    images: [
      {
        url: '/android-chrome-512x512.png',
        width: 512,
        height: 512,
        alt: 'sideby.me logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'sideby.me',
    description:
      'The ridiculously simple way to host watch parties. Create a room, share a link, and watch anything with friends in perfect sync.',
    images: ['/android-chrome-512x512.png'],
    site: '@whonoah_exe',
    creator: '@whonoah_exe',
  },
  // Robots & Crawlers
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${spaceMono.variable} antialiased`}>
        <NextTopLoader color="#ffffff" height={4} showSpinner={false} shadow="0 0 20px #ffffff, 0 0 40px #ffffff" />
        <ThemeProvider>
          <SocketProvider>
            <div className="max-w-screen-4xl mx-auto flex min-h-screen flex-col bg-background">
              <Navigation />
              <main className="container mx-auto flex-1 py-6">{children}</main>
              <Footer />
            </div>
            <Toaster richColors />
          </SocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
