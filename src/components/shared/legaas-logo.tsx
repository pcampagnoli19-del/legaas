import { cn } from '@/lib/utils';

export interface LegaasLogoProps {
  variant?: 'dark-bg' | 'light-bg';
  showTagline?: boolean;
  collapsed?: boolean;
  className?: string;
}

/**
 * Logotipo vetorial oficial do Legaas:
 * - Ícone geométrico: haste em "L" com canto chanfrado inferior-esquerdo + cantoneira
 *   superior-direita em verde esmeralda (#14C38E).
 * - Wordmark "LEGAAS" com espaçamento técnico amplo.
 */
export function LegaasLogo({
  variant = 'dark-bg',
  showTagline = false,
  collapsed = false,
  className,
}: LegaasLogoProps) {
  const lStrokeFill = variant === 'dark-bg' ? '#FFFFFF' : '#03193A';
  const wordmarkClass = variant === 'dark-bg' ? 'text-white' : 'text-brand-navy';
  const taglineClass = variant === 'dark-bg' ? 'text-slate-300' : 'text-slate-500';

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Haste principal em L com chanfro inferior-esquerdo (fiel ao logo oficial) */}
        <path d="M12 10 H30 V68 L38 76 H90 V92 H31 L12 73 Z" fill={lStrokeFill} />
        {/* Cantoneira superior-direita em verde esmeralda (#14C38E) */}
        <path d="M46 18 H88 V60 H72 V34 H46 Z" fill="#14C38E" />
      </svg>

      {!collapsed ? (
        <div className="flex flex-col leading-none">
          <span className={cn('text-sm font-bold tracking-[0.22em] uppercase', wordmarkClass)}>
            LEGAAS
          </span>
          {showTagline ? (
            <span className={cn('mt-1 text-[10px] tracking-wide', taglineClass)}>
              Your operations, under control.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
