import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegaasLogo } from '@/components/shared/legaas-logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-12">
      {/* Painel institucional lateral (Navy oficial #03193A) */}
      <aside className="bg-brand-navy hidden flex-col justify-between p-10 text-white lg:col-span-5 lg:flex">
        <div>
          <Link href="/" className="inline-block">
            <LegaasLogo variant="dark-bg" showTagline />
          </Link>
        </div>

        <div className="space-y-4">
          <p className="text-brand-emerald font-mono text-xs font-semibold tracking-wider uppercase">
            Legaas Office
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Gestão estruturada para operações jurídicas, societárias e paralegais.
          </h2>
          <p className="text-xs leading-relaxed text-slate-300">
            Acesso corporativo protegido por isolamento multi-tenant no banco de dados (PostgreSQL
            Row-Level Security) e trilha de auditoria imutável.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-slate-400">
          <ShieldCheck className="text-brand-emerald h-4 w-4 shrink-0" />
          <span>Acesso restrito a organizações e membros convidados.</span>
        </div>
      </aside>

      {/* Área de formulário */}
      <main className="flex flex-col items-center justify-center px-6 py-12 lg:col-span-7">
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <LegaasLogo variant="light-bg" showTagline />
          </Link>
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
