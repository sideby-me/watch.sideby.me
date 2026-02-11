import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Shield, Cookie, Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Legal',
  description: 'Legal information, policies, and compliance for sideby.me.',
};

const policies = [
  {
    href: '/privacy',
    icon: Shield,
    title: 'Privacy Policy',
    description: 'How we handle your data - spoiler: we keep it minimal.',
  },
  {
    href: '/terms',
    icon: FileText,
    title: 'Terms of Service',
    description: 'The rules of engagement for using sideby.me.',
  },
  {
    href: '/cookie-policy',
    icon: Cookie,
    title: 'Cookie Policy',
    description: 'What cookies and local storage we use (hardly any).',
  },
] as const;

export default function LegalPage() {
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
      <div className="mx-auto max-w-screen-md">
        {/* Header */}
        <header className="mb-12 flex flex-col gap-4">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl lg:text-6xl">Legal</h1>
          <p className="text-sm leading-relaxed tracking-tight text-muted-foreground sm:text-base">
            All the important stuff. We believe in transparency and keeping things simple, just like our product.
          </p>
        </header>

        {/* Policy cards */}
        <div className="flex flex-col gap-4">
          {policies.map(policy => {
            const Icon = policy.icon;
            return (
              <Link key={policy.href} href={policy.href}>
                <Card className="group flex items-start gap-4 border border-border bg-background p-6 transition-colors hover:border-foreground/20 hover:border-primary hover:bg-muted/30">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
                    <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-semibold tracking-tight text-foreground">{policy.title}</span>
                    <span className="text-sm tracking-tight text-muted-foreground">{policy.description}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Contact section */}
        <div className="mt-12 border-t border-border pt-8">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold tracking-tight text-foreground">Questions or concerns?</span>
              <p className="text-sm tracking-tight text-muted-foreground">
                Reach out to us at{' '}
                <a
                  href="mailto:hello@sideby.me"
                  className="text-foreground underline underline-offset-4 hover:text-primary-700"
                >
                  hello@sideby.me
                </a>{' '}
                for any legal inquiries, DMCA takedown requests, or data-related questions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
