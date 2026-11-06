import { ArrowRight, LogIn, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { LegaasLogo } from '@/components/shared/legaas-logo';
import { Badge } from '@/components/ui/badge';

export default function HomePage() {
  const isDevOrTest = process.env.NODE_ENV !== 'production';

  return (
    <div className="bg-brand-navy flex min-h-screen flex-col justify-between text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <LegaasLogo variant="dark-bg" showTagline />
        <div className="flex items-center gap-3">
          <Badge variant="emerald">MVP · Fase 1.1</Badge>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Entrar</span>
          </Link>
        </div>
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

          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Link
              href="/login"
              className="bg-brand-emerald hover:bg-brand-emerald-dark inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:text-white"
            >
              <span>Entrar no Legaas Office</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>

            {isDevOrTest ? (
              <Link
                href="/demonstracao-dev"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span>Preview do Shell (Dev)</span>
              </Link>
            ) : null}
          </div>
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
