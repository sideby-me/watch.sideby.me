import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/src/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-base font-bold transition-interactive disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[2px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-500 active:bg-primary',
        disabled: 'bg-neutral-200 text-neutral-400 cursor-not-allowed',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-primary-100 active:bg-primary-50',
        destructive: 'bg-destructive text-primary-foreground hover:bg-destructive-500 active:bg-destructive',
        outline: 'border border-border bg-background text-accent-foreground hover:bg-accent active:bg-background',
        // ghost: 'hover:bg-muted hover:text-muted-foreground active:bg-neutral-200',
        // Removed active state from ghost to make the navbar buttons more subtle
        ghost: 'hover:bg-muted hover:text-muted-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 gap-2 has-[>svg]:px-3',
        sm: 'h-6 gap-1 px-2 has-[>svg]:px-2',
        lg: 'h-10 px-4 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
