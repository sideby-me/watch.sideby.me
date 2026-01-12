import * as React from 'react';

import { cn } from '@/src/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'shadow-xs flex h-9 w-full min-w-0 rounded-md border border-border bg-transparent px-3 py-1 text-base tracking-tight outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-neutral disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring/50',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

export { Input };
