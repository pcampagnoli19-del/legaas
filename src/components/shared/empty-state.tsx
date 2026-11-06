import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      ) : null}
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
