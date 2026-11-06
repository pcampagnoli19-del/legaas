import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-8 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
