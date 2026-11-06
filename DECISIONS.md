# LEGAAS — DECISIONS LOG

## 1. Objetivo deste documento

Este arquivo registra as decisões estruturais, funcionais, comerciais e arquiteturais tomadas durante o desenvolvimento do Legaas.

Seu objetivo é preservar a coerência do produto ao longo de sua evolução.

O documento deverá ser consultado antes de alterações relevantes e atualizado sempre que uma nova decisão for estabelecida.

As decisões registradas não são imutáveis, mas não devem ser alteradas unilateralmente pelo agente de desenvolvimento.

---

## 2. Identidade do produto

**Nome oficial:** Legaas.

**Categoria:** SaaS de gestão operacional.

**Posicionamento:** Legal Operations Management.

**Slogan inicial:** Your operations, under control.

O Legaas deverá ser apresentado como uma plataforma de gestão de operações, e não apenas como um gerenciador de tarefas jurídicas.

A identidade visual deverá transmitir profissionalismo, tecnologia, organização e confiabilidade.

---

## 3. Público-alvo

O produto atenderá dois grupos principais:

**Grupo A — Prestadores de serviços**
- Escritórios de advocacia.
- Empresas paralegais.
- Escritórios de contabilidade.
- Legal BPOs.
- Consultorias societárias.
- Empresas de regularização.

**Grupo B — Departamentos internos**
- Jurídico corporativo.
- Societário.
- Governança corporativa.
- Compliance.
- Legal Operations.
- Departamentos administrativos.

**Decisão:** o Legaas não será limitado a uma especialidade jurídica ou a um único tipo de organização.

Sua estrutura deverá ser configurável para diferentes operações.

---

## 4. Estrutura dos ambientes

O produto possuirá dois ambientes integrados:

### Legaas Office

Ambiente interno utilizado pela organização para administrar sua operação.

### Legaas Client

Portal externo utilizado por clientes e solicitantes para abrir solicitações, encaminhar documentos, acompanhar demandas e realizar aprovações.

**Decisão:** os ambientes compartilharão infraestrutura e dados autorizados, mas terão interfaces e controles de acesso próprios.

Informações internas não poderão ser expostas automaticamente ao portal externo.

---

## 5. Configurabilidade

**Decisão:** a plataforma deverá ser configurável.

Não será desenvolvido um sistema limitado a fluxos fixos de serviços societários ou paralegais.

Cada organização deverá poder adaptar:

- Departamentos.
- Serviços.
- Categorias.
- Status.
- Etapas.
- Campos.
- Formulários.
- Responsáveis.
- Aprovações.
- Prazos.
- Notificações.
- Permissões.

A configuração deverá ocorrer preferencialmente pela própria interface, sem exigir alterações no código-fonte.

---

## 6. Modelo de entidades

**Decisão:** as entidades Organização, Cliente, Empresa e Demanda deverão ser independentes.

Suas funções são:

- Organização: empresa contratante da plataforma Legaas.
- Cliente: pessoa ou organização atendida pelo usuário do Legaas.
- Empresa: pessoa jurídica vinculada a um cliente.
- Demanda: solicitação ou serviço executado pela organização.

O sistema deverá suportar múltiplos clientes, múltiplas empresas por cliente e múltiplas demandas por empresa.

---

## 7. Arquitetura multi-tenant

**Decisão:** o Legaas será multi-tenant desde sua concepção.

O isolamento entre organizações será obrigatório em todas as operações.

Não será aceita uma implementação que dependa exclusivamente de filtros visuais ou verificações no frontend.

A arquitetura deverá considerar autenticação, autorização, persistência, arquivos e auditoria.

---

## 8. Perfis de acesso

Os perfis iniciais serão:

1. Superadministrador.
2. Administrador da organização.
3. Gestor.
4. Coordenador.
5. Analista.
6. Visualizador.
7. Usuário externo.

**Decisão:** os perfis iniciais não deverão limitar a evolução para permissões granulares.

O sistema deverá permitir controle de acesso por organização, departamento, cliente, empresa, demanda e documento.

---

## 9. Diretrizes de experiência

**Decisão:** a interface será corporativa, limpa e funcional.

Referências de experiência:
- Linear.
- Notion.
- Monday.
- ClickUp.

Não copiar diretamente suas interfaces.

Priorizar produtividade, clareza, hierarquia visual e facilidade de utilização.

Evitar excesso de decoração, gradientes, sombras e componentes sem função prática.

---

## 10. Estratégia de desenvolvimento

**Decisão:** desenvolvimento incremental.

O projeto será construído por fases, seguindo o roadmap.

A prioridade inicial será entregar um Legaas Office funcional, seguido pelo Legaas Client e, posteriormente, recursos avançados de inteligência e automação.

Não antecipar funcionalidades complexas que não sejam necessárias para validar o MVP.

Não considerar telas visuais como funcionalidades concluídas.

---

## 11. Funcionalidades adiadas

Não fazem parte do escopo prioritário do MVP:

- Robôs complexos para portais públicos.
- Integrações com todas as juntas comerciais.
- Inteligência artificial avançada.
- Aplicativos nativos.
- Sistema financeiro completo.
- Assinatura eletrônica proprietária.
- Integrações indiscriminadas.

Esses itens poderão ser reconsiderados mediante decisão posterior.

---

## 12. Diretrizes de segurança

**Decisão:** segurança será requisito estrutural, não funcionalidade futura.

A implementação deverá considerar:

- LGPD.
- Controle de acesso no backend.
- Isolamento multi-tenant.
- Proteção documental.
- Criptografia adequada.
- Logs de auditoria.
- Validação de dados.
- Proteção de credenciais.
- Backups.

---

## 13. Stack tecnológica

A stack definitiva deverá ser estabelecida após a análise técnica do repositório.

Tecnologias inicialmente consideradas:

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- PostgreSQL.
- Prisma ou Drizzle ORM.
- Armazenamento compatível com S3.

**Decisão:** não adotar tecnologias apenas por preferência ou tendência. A escolha deverá considerar o contexto real do projeto, manutenção, segurança e escalabilidade.

---

## 14. Histórico de decisões

Utilize este espaço para registrar novas decisões.

Cada registro deverá conter:

- Data.
- Decisão.
- Contexto.
- Justificativa.
- Impactos.
- Arquivos ou módulos afetados.

### Registro inicial

**Data:** 06/11/2026.

**Decisão:** estabelecimento da identidade, proposta de valor, público-alvo, ambientes, princípios arquiteturais e roadmap inicial do Legaas.

**Justificativa:** criar uma direção comum para o desenvolvimento do produto e evitar decisões contraditórias ao longo das implementações.

### Aprovação da Arquitetura, Stack, Modelo Relacional e Fundação (Fase 0)

**Data:** 06/11/2026.

**Decisão:**
1. **Stack oficial (A1):** Next.js 16 (App Router) + TypeScript 6 (strict) + PostgreSQL 17 (com Row-Level Security forçado) + Drizzle ORM + Better Auth + Zod + Tailwind CSS v4 / shadcn + Storage S3 privado + Vitest / Playwright.
2. **Modelo Cliente × Empresa × Demanda (A2):** relação 1:N (`companies.client_id NOT NULL`), suporte a grupos empresariais via `parent_company_id` na mesma organização e integridade garantida no banco por FK tripla `(organization_id, client_id, company_id)` em `demands`.
3. **Contexto de Organização na URL (A3):** rotas do Legaas Office estruturadas sob `/[orgSlug]/...` com validação estrita no servidor e resolução transacional via `withTenant()` (`SET LOCAL ROLE legaas_app` + `set_config('app.current_org_id', orgId, true)`).
4. **Criação de Organizações no MVP (A4):** regime fechado (criadas por superadmin/CLI/seed); usuários ingressam exclusivamente por convite auditado com token hash de uso único (`invitations`).
5. **Autorização no MVP (A5):** RBAC com escopo por departamento (`departments`, `department_members`).
6. **Status da Demanda (A6):** derivado diretamente da categoria da etapa atual do workflow (`backlog`, `active`, `waiting`, `done`, `cancelled`), evitando dupla máquina de estados.
7. **Prazos (A7):** `demands.due_date` representa o prazo geral de conclusão; a entidade `deadlines` representa obrigações específicas vinculadas à demanda ou tarefa.
8. **Infraestrutura e Região (A8):** container Docker em PaaS/Cloud com PostgreSQL gerenciado na região Brasil (`sa-east-1`).
9. **Idioma e Rótulos (A9) e Público do Piloto (A14):** apenas `pt-BR` com rótulos fixos no MVP, priorizando o Grupo A (prestadores de serviços jurídicos, societários e paralegais).
10. **Identidade Visual Oficial (A10):** estilo corporativo sóbrio apenas em modo claro no MVP, utilizando a paleta oficial do logotipo (`#03193A` Navy e `#14C38E` Esmeralda), escala neutra Slate/Zinc e tipografia Geist Sans / Geist Mono.

**Contexto:** conclusão da análise técnica inicial (Fase 0.1) e implementação da fundação do projeto (Fase 0).

**Justificativa:** garantir isolamento multi-tenant verificável por testes automatizados no banco de dados (meta-teste de RLS no CI) e evitar retrabalho estrutural na Fase 1.

**Impactos:** todas as 22 tabelas multi-tenant exigem `ENABLE + FORCE ROW LEVEL SECURITY`, política para `legaas_app` e FKs compostas com `organization_id`.

**Arquivos ou módulos afetados:** `src/server/db/*`, `drizzle/*`, `tests/tenancy/rls-coverage.test.ts`, `src/app/(office)/[orgSlug]/*`, `docs/architecture.md`.

---

## 15. Regra para alterações futuras

Quando surgir uma proposta que contrarie uma decisão registrada:

1. Identifique a decisão afetada.
2. Explique por que a alteração está sendo considerada.
3. Apresente vantagens, desvantagens e impactos.
4. Recomende uma alternativa.
5. Aguarde aprovação antes de modificar uma decisão estrutural.

Decisões técnicas de implementação que não alterem os fundamentos do produto poderão ser tomadas autonomamente.

**Princípio central: o Legaas deve evoluir sem perder sua identidade, coerência e propósito.**
