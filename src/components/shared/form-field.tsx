import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
  children: ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  required = false,
  hint,
  errors,
  children,
  className,
}: FormFieldProps) {
  const hasError = Boolean(errors && errors.length > 0);

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !hasError ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
      {hasError ? (
        <ul className="space-y-0.5 text-[11px] text-red-600" role="alert">
          {errors?.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
