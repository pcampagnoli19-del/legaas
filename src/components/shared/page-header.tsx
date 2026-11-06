import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow ? (
          <p className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="max-w-2xl text-xs text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
