'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, Home, Menu, BadgePlus } from 'lucide-react';

const EXTENSION_URL = 'https://pass.sideby.me';

function ChromeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
    </svg>
  );
}

const navigationItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/create', label: 'Create Room', icon: BadgePlus },
  { href: '/join', label: 'Join Room', icon: Users },
];

export function Navigation() {
  const pathname = usePathname();

  const activeItem = navigationItems.find(item => item.href === pathname);
  const ActiveIcon = activeItem?.icon;

  return (
    <nav className="mx-4 rounded-full border border-border bg-accent">
      <div className="mx-auto p-6">
        <div className="flex h-12 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 px-4 md:px-12">
            <Image src="/logo-monoline.svg" alt="Sideby.me logo" width={32} height={32} className="h-8 w-8" />
            <span className="hidden text-3xl font-semibold tracking-tighter md:flex">sideby.me</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center space-x-4 px-12 md:flex">
            {navigationItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button variant={pathname === href ? 'default' : 'ghost'} size="default" className="flex items-center">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Button>
              </Link>
            ))}
            <a
              href={EXTENSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-primary"
              aria-label="Get Chrome Extension"
            >
              <ChromeIcon className="h-5 w-5" />
            </a>
          </div>

          {/* Mobile Navigation */}
          <div className="flex items-center gap-2 md:hidden">
            <Button variant="ghost" size="default" className="flex items-center">
              {ActiveIcon && <ActiveIcon className="h-4 w-4" />}
              <span>{activeItem?.label || 'Where are we?'}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Menu className="h-6 w-6" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {navigationItems.map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className="flex items-center space-x-2">
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem asChild>
                  <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-primary">
                    <ChromeIcon className="h-4 w-4" />
                    <span>Get Extension</span>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
