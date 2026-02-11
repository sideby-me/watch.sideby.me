import Link from 'next/link';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
      <article className="mx-auto max-w-screen-md">
        {/* Header */}
        <header className="mb-12 flex flex-col gap-4">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="text-sm tracking-tight text-muted-foreground">Last updated: {lastUpdated}</p>
        </header>

        {/* Content */}
        <div className="legal-content flex flex-col gap-8 text-sm leading-relaxed tracking-tight text-muted-foreground sm:text-base [&_h2]:mb-4 [&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tighter [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:mb-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
          {children}
        </div>

        {/* Back link */}
        <div className="mt-16 border-t border-border pt-8">
          <Link
            href="/legal"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to Legal
          </Link>
        </div>
      </article>
    </div>
  );
}
