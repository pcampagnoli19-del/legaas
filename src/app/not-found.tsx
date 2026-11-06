import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16 text-slate-900">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <p className="font-mono text-xs font-semibold tracking-wider text-slate-500 uppercase">
          404 · Recurso não encontrado
        </p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">
          Página ou organização indisponível
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          O endereço acessado não existe ou a sua conta não possui acesso à organização solicitada.
        </p>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
