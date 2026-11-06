import Module from 'node:module';

// Intercepta `import 'server-only'` / `require('server-only')` quando pré-carregado via `tsx -r` ou Vitest.
const internalModule = Module as typeof Module & {
  _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
};

if (typeof internalModule._load === 'function') {
  const originalLoad = internalModule._load;
  internalModule._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === 'server-only') {
      return {};
    }
    return originalLoad.apply(this, [request, parent, isMain]);
  };
}

export {};
