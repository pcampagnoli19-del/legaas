import { ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { LegaasLogo } from '@/components/shared/legaas-logo';
import { Badge } from '@/components/ui/badge';

export default function HomePage() {
  const isDevOrTest = process.env.NODE_ENV !== 'production';

  return (
    <div className="flex min-h-screen flex-col justify-between bg-brand-navy text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <LegaasLogo variant="dark-bg" showTagline />
        <Badge variant="emerald">Fase 0 · Fundação</Badge>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="max-w-2xl space-y-5">
          <p className="text-brand-emerald font-mono text-xs font-semibold tracking-widest uppercase">
            Legal Operations Management
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Sua operação jurídica, societária e paralegal sob controle.
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">
            Plataforma SaaS multi-tenant para gestão estruturada de clientes, grupos empresariais,
            demandas, workflows configuráveis, prazos e documentos.
          </p>

          {isDevOrTest ? (
            <div className="pt-3">
              <Link
                href="/demonstracao-dev"
                className="bg-brand-emerald hover:bg-brand-emerald-dark inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:text-white"
              >
                <span>Acessar Shell do Legaas Office (Ambiente Dev)</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between border-t border-white/10 px-6 py-5 text-xs text-slate-400">
        <span>LEGAAS — Your operations, under control.</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
          <ShieldCheck className="text-brand-emerald h-3.5 w-3.5" />
          Isolamento Multi-Tenant RLS
        </span>
      </footer>
    </div>
  );
}
