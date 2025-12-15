'use client';

import Link from 'next/link';
import { Separator } from '../ui/separator';
import { Github, Instagram, Twitter } from 'lucide-react';
import Image from 'next/image';

const productLinks = [
  { href: '/create', label: 'Create Room' },
  { href: '/join', label: 'Join Room' },
];

const socialLinks = [
  { href: 'https://www.instagram.com/_sidebyme/', label: 'Instagram', Icon: Instagram },
  { href: 'https://github.com/whonoahexe/sideby.me', label: 'Github', Icon: Github },
  { href: 'https://x.com/_sidebyme', label: 'Twitter', Icon: Twitter },
];

const legalLinks = [
  { href: '/legal', label: 'Legal' },
  { href: '/feedback', label: 'Give Feedback' },
];

const policyLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

const otherLinks = [
  { href: '/cookie-policy', label: 'Cookie Policy' },
  { href: '/sitemap', label: 'Sitemap' },
];

export function Footer() {
  const footerLink =
    'inline-block w-auto text-muted-foreground underline-offset-4 hover:text-primary-700 hover:underline';

  return (
    <footer className="px-6 py-24">
      <div className="4xl:max-w-screen-3xl mx-auto flex max-w-screen-2xl flex-col gap-12">
        {/* Product Links */}
        <div className="flex flex-col justify-between gap-6 tracking-tight md:flex-row">
          <div className="flex min-w-36 flex-1 flex-col gap-6">
            <span className="text-sm font-bold">Jump In</span>
            <div className="flex flex-col items-start gap-4">
              {productLinks.map(l => (
                <Link key={l.href} href={l.href} className={footerLink}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex min-w-36 flex-1 flex-col gap-6">
            <span className="text-sm font-bold">Stay Connected</span>
            <div className="flex gap-4">
              {socialLinks.map(s => {
                const Icon = s.Icon;
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="inline-block text-muted-foreground hover:text-primary-700"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <Separator />

        {/* Other Links */}
        <div className="flex flex-col justify-between gap-6 tracking-tight md:flex-row">
          <div className="flex-1">
            <Image src="/logo-monoline.svg" alt="Sideby.me logo" width={32} height={32} className="h-8 w-8" />
          </div>
          <div className="flex min-w-36 flex-1 flex-col items-start gap-4">
            {legalLinks.map(l => (
              <Link key={l.href} href={l.href} className={footerLink}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="flex min-w-36 flex-1 flex-col items-start gap-4">
            {policyLinks.map(l => (
              <Link key={l.href} href={l.href} className={footerLink}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="flex min-w-36 flex-1 flex-col items-start gap-4">
            {otherLinks.map(l => (
              <Link key={l.href} href={l.href} className={footerLink}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <p className="w-full text-center text-sm font-medium tracking-tight text-neutral">
          © Watch.With {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
