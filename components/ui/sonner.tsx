'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps } from 'sonner';
import * as React from 'react';
import { cn } from '@/src/lib/utils';

const Toaster = ({ className, ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className={cn(
        'toaster z-50 flex flex-col gap-4 [&_[data-sonner-toast]]:pointer-events-auto',
        'px-4 py-3',
        className
      )}
      style={
        {
          '--normal-bg': 'hsl(var(--popover))',
          '--normal-text': 'hsl(var(--popover-foreground))',
          '--normal-border': 'hsl(var(--border))',
          '--success-bg': 'rgb(5, 20, 4)',
          '--success-text': 'rgb(121, 224, 115)',
          '--error-bg': 'rgb(67, 20, 8)',
          '--error-text': 'rgb(242, 163, 143)',
          '--info-bg': 'rgb(2, 38, 71)',
          '--info-text': 'rgb(63, 160, 250)',
          '--warning-bg': 'rgb(67, 20, 8)',
          '--warning-text': 'rgb(242, 163, 143)',
          '--toast-border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      position={props.position || 'bottom-right'}
      {...props}
    />
  );
};

export { Toaster };
