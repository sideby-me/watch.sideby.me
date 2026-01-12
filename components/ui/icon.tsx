import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/src/lib/utils';

const iconVariants = cva('inline-flex items-center justify-center rounded-full outline-none', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-primary-100 text-primary-800',
      destructive: 'bg-destructive-100 text-destructive-800',
      success: 'bg-success-100 text-success-800',
    },
    size: {
      sm: 'size-6 [&_svg]:size-3',
      default: 'size-8 [&_svg]:size-4',
      lg: 'size-12 [&_svg]:size-8',
      xl: 'size-16 [&_svg]:size-9',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof iconVariants> {}

function Icon({ className, variant, size, children, ...props }: IconProps) {
  return (
    <span data-slot="icon" className={cn(iconVariants({ variant, size, className }))} {...props}>
      {children}
    </span>
  );
}

export { Icon, iconVariants };
