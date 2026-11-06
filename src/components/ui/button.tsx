import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-navy text-white hover:bg-brand-navy-elevated',
        accent:
          'bg-brand-emerald text-slate-950 font-semibold hover:bg-brand-emerald-dark hover:text-white',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        outline:
          'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-950',
        ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        default: 'h-8 px-3.5 py-1.5',
        sm: 'h-7 rounded-md px-2.5 text-xs',
        lg: 'h-9 rounded-md px-4 text-sm',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
