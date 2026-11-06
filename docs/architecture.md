# LEGAAS — Arquitetura Técnica e Fundação Multi-Tenant

Este documento consolida a arquitetura implementada na **Fase 0** do Legaas, em conformidade com `README.md`, `CLAUDE.md`, `ROADMAP.md` e `DECISIONS.md`.

---

## 1. Visão Geral (Monólito Modular)

O Legaas é estruturado como um **monólito modular** em **Next.js 16 (App Router)** com **TypeScript 6 (strict)**, **PostgreSQL 17** e **Drizzle ORM**.

- **Legaas Office (`src/app/(office)/[orgSlug]`)**: ambiente interno de gestão e operação.
- **Legaas Client (`src/app/(portal)`)**: portal externo para clientes e solicitantes (Fase 2), isolado por regras de lint (`no-restricted-imports`) que proíbem a importação direta de módulos internos do Office.
- **Camada de Domínio (`src/server`)**: isolada por `server-only`, concentrando banco de dados, contexto transacional multi-tenant, tratamento de erros e logs estruturados.

---

## 2. Isolamento Multi-Tenant em Três Camadas

Todo dado operacional pertence a uma `Organization` (`organization_id NOT NULL`). O isolamento não depende de filtros visuais e é garantido por três barreiras complementares:

1. **Camada de Aplicação (`withTenant` em `src/server/db/tenant.ts`)**:
   - O `organizationId` jamais é aceito a partir do payload do cliente; é resolvido no servidor a partir do `orgSlug` da URL (`/[orgSlug]/...`) e da `Membership` ativa do usuário autenticado.
   - Toda operação de banco ocorre dentro de `withTenant(ctx, callback)`, que abre uma transação e executa `SET LOCAL ROLE legaas_app` e `SELECT set_config('app.current_org_id', orgId, true)`.
2. **Camada de Integridade Relacional (FKs Compostas e Triplas)**:
   - Todas as 22 tabelas operacionais possuem constraint `UNIQUE (organization_id, id)`.
   - Chaves estrangeiras entre entidades de tenant são sempre compostas por `(organization_id, <fk_id>)`, impedindo fisicamente no PostgreSQL o vínculo entre registros de organizações distintas.
   - Em `demands`, a FK tripla `(organization_id, client_id, company_id) -> companies(organization_id, client_id, id)` garante que a pessoa jurídica vinculada pertence obrigatoriamente ao cliente da demanda (Decisão A2).
3. **Camada de Persistência (PostgreSQL Row-Level Security)**:
   - A migration `drizzle/0001_enable_rls_policies.sql` ativa `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` em `organizations` e em todas as 22 tabelas com `organization_id`.
   - A política `tenant_isolation_policy` exige `organization_id = public.current_org_id()`. Sem `app.current_org_id` definido na transação, `current_org_id()` retorna `NULL` e nenhuma linha pode ser lida ou escrita.
   - A role de runtime `legaas_app` é criada com `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`.
   - A tabela `activity_log` é **append-only**: permissões de `UPDATE`, `DELETE` e `TRUNCATE` são revogadas de `legaas_app`.

### Meta-Teste Obrigatório no CI

O arquivo `tests/tenancy/rls-coverage.test.ts` inspeciona o catálogo do PostgreSQL (`pg_class`, `pg_attribute`, `pg_policy`, `pg_roles`) e falha automaticamente o build se qualquer tabela com coluna `organization_id` for criada sem `ENABLE + FORCE ROW LEVEL SECURITY` e política ativa.

---

## 3. Identidade Visual Oficial

Extraída do logotipo oficial (`public/brand/logo-legaas.jpg` e `src/components/shared/legaas-logo.tsx`):

- **Navy Primário (`--brand-navy`)**: `#03193A`
- **Navy Elevado (`--brand-navy-elevated`)**: `#07234F`
- **Esmeralda Técnico (`--brand-emerald`)**: `#14C38E`
- **Superfícies e Tipografia**: escala neutra Slate/Zinc em modo claro e fontes `Geist Sans` / `Geist Mono`.
