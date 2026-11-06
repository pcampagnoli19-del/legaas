'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalErrorBoundary({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[Legaas UI Error Boundary]', error.digest ?? error.name);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16 text-slate-900">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Falha operacional
        </p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">
          Não foi possível carregar esta visão
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Ocorreu um erro inesperado ao processar a solicitação. Nenhuma informação foi perdida.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-slate-400">
            Código de referência: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
