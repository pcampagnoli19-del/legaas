# LEGAAS — ROADMAP DE DESENVOLVIMENTO

## Visão geral

Este documento estabelece o planejamento evolutivo do Legaas, desde sua estrutura inicial até a consolidação como uma plataforma SaaS de gestão operacional.

O desenvolvimento deverá ocorrer por etapas, priorizando funcionalidades essenciais, estabilidade, segurança e experiência de utilização.

O roadmap é um documento vivo e poderá ser atualizado conforme a evolução do produto, desde que alterações relevantes sejam registradas em `DECISIONS.md`.

---

# FASE 0 — FUNDAÇÃO DO PROJETO

\<text>Objetivo: estabelecer a arquitetura e a infraestrutura necessárias para desenvolver o Legaas de maneira organizada e escalável.\</text>

### 0.1. Análise inicial

- [ ] Analisar a estrutura existente do repositório.
- [ ] Verificar tecnologias e dependências já utilizadas.
- [ ] Identificar arquivos, configurações e implementações existentes.
- [ ] Propor arquitetura inicial.
- [ ] Definir estrutura de diretórios.
- [ ] Identificar riscos e dependências técnicas.

### 0.2. Infraestrutura

- [ ] Configuração do ambiente de desenvolvimento.
- [ ] Configuração das variáveis de ambiente.
- [ ] Configuração do banco de dados.
- [ ] Configuração do ORM.
- [ ] Estrutura inicial de migrations.
- [ ] Configuração de validações.
- [ ] Configuração de tratamento de erros.
- [ ] Configuração de testes.
- [ ] Configuração de lint e formatação.

### 0.3. Identidade e interface

- [ ] Definir identidade visual inicial.
- [ ] Criar sistema de cores e tipografia.
- [ ] Criar componentes básicos.
- [ ] Desenvolver estrutura de navegação.
- [ ] Criar layout principal do Legaas Office.
- [ ] Definir comportamento responsivo.

**Critério de conclusão:** projeto executável, arquitetura documentada, banco configurado e estrutura visual inicial funcional.

---

# FASE 1 — MVP OPERACIONAL

\<badge color="success">Prioridade máxima\</badge>

Objetivo: entregar uma primeira versão utilizável do Legaas Office, capaz de administrar uma operação real.

## 1.1. Autenticação e organizações

- [ ] Cadastro e autenticação.
- [ ] Login e logout.
- [ ] Recuperação de senha.
- [ ] Cadastro de organizações.
- [ ] Associação de usuários às organizações.
- [ ] Isolamento multi-tenant.
- [ ] Contexto da organização ativa.
- [ ] Gestão de sessões.

## 1.2. Usuários e permissões

- [ ] Cadastro de usuários.
- [ ] Edição e desativação.
- [ ] Convites de usuários.
- [ ] Perfis de acesso.
- [ ] Permissões básicas.
- [ ] Associação a departamentos.
- [ ] Controle de acesso no backend.

## 1.3. Departamentos e equipes

- [ ] Cadastro de departamentos.
- [ ] Edição de departamentos.
- [ ] Associação de usuários.
- [ ] Definição de gestores e coordenadores.
- [ ] Organização da estrutura interna.

## 1.4. Clientes

- [ ] Cadastro de clientes.
- [ ] Edição de clientes.
- [ ] Cadastro de contatos.
- [ ] Dados cadastrais.
- [ ] Histórico de relacionamento.
- [ ] Pesquisa e filtros.
- [ ] Ativação e desativação.

## 1.5. Empresas

- [ ] Cadastro de pessoas jurídicas.
- [ ] CNPJ.
- [ ] Razão social e nome fantasia.
- [ ] Endereço.
- [ ] Dados cadastrais complementares.
- [ ] Associação entre cliente e empresa.
- [ ] Suporte a grupos empresariais.
- [ ] Pesquisa e filtros.

## 1.6. Demandas

Este será um dos módulos centrais da plataforma.

- [ ] Cadastro de demandas.
- [ ] Identificador único.
- [ ] Título e descrição.
- [ ] Cliente relacionado.
- [ ] Empresa relacionada, quando aplicável.
- [ ] Categoria.
- [ ] Serviço.
- [ ] Departamento responsável.
- [ ] Responsável principal.
- [ ] Participantes.
- [ ] Prioridade.
- [ ] Status.
- [ ] Data de abertura.
- [ ] Prazo de conclusão.
- [ ] Histórico de alterações.
- [ ] Comentários internos.
- [ ] Anexos.
- [ ] Pesquisa avançada.
- [ ] Filtros combinados.

### Visualizações

- [ ] Visualização em tabela.
- [ ] Visualização em lista.
- [ ] Visualização Kanban.
- [ ] Visualização detalhada.
- [ ] Ordenação.
- [ ] Filtros salvos.

## 1.7. Tarefas e atividades

- [ ] Criar tarefas vinculadas às demandas.
- [ ] Definir responsáveis.
- [ ] Definir prazos.
- [ ] Alterar status.
- [ ] Registrar conclusão.
- [ ] Histórico de atividades.
- [ ] Identificar tarefas atrasadas.

## 1.8. Workflows básicos

- [ ] Cadastro de fluxos.
- [ ] Definição de etapas.
- [ ] Associação de workflows a serviços.
- [ ] Transição entre etapas.
- [ ] Responsáveis por etapa.
- [ ] Histórico de movimentação.
- [ ] Validação de transições.

Nesta fase, os fluxos poderão utilizar configurações simples, sem necessidade de um construtor visual avançado.

## 1.9. Prazos e obrigações

- [ ] Cadastro de prazos.
- [ ] Prazos internos.
- [ ] Prazos externos.
- [ ] Prazos contratuais.
- [ ] Associação a demandas.
- [ ] Alertas de vencimento.
- [ ] Identificação de atrasos.
- [ ] Calendário operacional básico.

## 1.10. Documentos

- [ ] Upload de documentos.
- [ ] Download seguro.
- [ ] Associação a clientes.
- [ ] Associação a empresas.
- [ ] Associação a demandas.
- [ ] Classificação documental.
- [ ] Controle de acesso.
- [ ] Histórico básico.

## 1.11. Dashboard operacional

- [ ] Total de demandas.
- [ ] Demandas abertas.
- [ ] Demandas concluídas.
- [ ] Demandas atrasadas.
- [ ] Demandas por status.
- [ ] Demandas por responsável.
- [ ] Próximos vencimentos.
- [ ] Atividades recentes.
- [ ] Distribuição básica de trabalho.

Todos os indicadores deverão refletir dados reais do banco de dados.

**Critério de conclusão:** uma organização consegue cadastrar usuários, clientes, empresas, criar demandas, distribuir tarefas, controlar prazos e acompanhar sua operação.

---

# FASE 2 — LEGAAS CLIENT

Objetivo: permitir que clientes externos interajam diretamente com a operação.

## 2.1. Acesso externo

- [ ] Login de usuários externos.
- [ ] Convite de clientes.
- [ ] Associação de usuários externos a clientes.
- [ ] Controle de permissões externas.
- [ ] Recuperação de senha.

## 2.2. Solicitações

- [ ] Formulários de abertura de solicitações.
- [ ] Tipos de serviços configuráveis.
- [ ] Campos personalizados.
- [ ] Upload de documentos.
- [ ] Geração automática de demanda no Office.
- [ ] Confirmação de recebimento.

## 2.3. Acompanhamento

- [ ] Listagem de solicitações.
- [ ] Consulta de status.
- [ ] Histórico disponibilizado ao cliente.
- [ ] Visualização de prazos autorizados.
- [ ] Consulta de documentos compartilhados.
- [ ] Notificações de movimentação.

## 2.4. Aprovações e comunicação

- [ ] Solicitações de aprovação.
- [ ] Aprovação ou rejeição.
- [ ] Registro de decisões.
- [ ] Comentários externos.
- [ ] Comunicação vinculada às demandas.
- [ ] Notificações por e-mail.

## 2.5. Segurança do portal

- [ ] Separação entre dados internos e externos.
- [ ] Permissões por cliente.
- [ ] Permissões por empresa.
- [ ] Controle de documentos compartilhados.
- [ ] Proteção de informações privadas.

**Critério de conclusão:** clientes conseguem abrir solicitações, enviar documentos, acompanhar serviços e realizar aprovações sem acessar informações internas da organização.

---

# FASE 3 — INTELIGÊNCIA OPERACIONAL

Objetivo: transformar os dados operacionais em informações úteis para gestão e tomada de decisões.

## 3.1. Indicadores

- [ ] Volume de demandas por período.
- [ ] Volume por cliente.
- [ ] Volume por departamento.
- [ ] Volume por serviço.
- [ ] Tempo médio de conclusão.
- [ ] Demandas dentro e fora do prazo.
- [ ] Cumprimento de SLA.
- [ ] Backlog operacional.
- [ ] Taxa de retrabalho.
- [ ] Distribuição de atividades.

## 3.2. Produtividade

- [ ] Indicadores individuais.
- [ ] Indicadores por equipe.
- [ ] Indicadores por departamento.
- [ ] Análise de capacidade operacional.
- [ ] Distribuição de carga de trabalho.
- [ ] Comparação entre períodos.

Os indicadores deverão considerar critérios transparentes. Volume de tarefas, isoladamente, não deverá ser tratado como medida definitiva de produtividade.

## 3.3. Relatórios

- [ ] Relatórios personalizados.
- [ ] Filtros por período.
- [ ] Filtros por cliente.
- [ ] Filtros por departamento.
- [ ] Exportação de dados.
- [ ] Relatórios gerenciais.

## 3.4. Workflow Builder

- [ ] Construtor visual de etapas.
- [ ] Configuração de responsáveis.
- [ ] Condições de transição.
- [ ] Campos obrigatórios.
- [ ] Documentos obrigatórios.
- [ ] Aprovações.
- [ ] Notificações automáticas.
- [ ] Regras condicionais.

## 3.5. Automações

- [ ] Alertas automáticos.
- [ ] Distribuição automática de demandas.
- [ ] Alteração automática de status.
- [ ] Notificações por eventos.
- [ ] Regras de vencimento.
- [ ] Automações configuráveis.

**Critério de conclusão:** gestores conseguem analisar a operação, identificar gargalos, acompanhar resultados e configurar processos mais complexos.

---

# FASE 4 — EXPANSÃO E ECOSSISTEMA

Objetivo: ampliar a capacidade de integração, automação e inteligência do Legaas.

## 4.1. Inteligência artificial

- [ ] Análise documental.
- [ ] Extração de informações.
- [ ] Identificação de dados relevantes.
- [ ] Classificação automática de documentos.
- [ ] Resumo de documentos.
- [ ] Sugestões de preenchimento.
- [ ] Assistente operacional.
- [ ] Apoio à identificação de inconsistências.

A IA deverá atuar como ferramenta de apoio, sem executar decisões jurídicas ou operacionais sensíveis sem validação humana.

## 4.2. Integrações

- [ ] Integração com e-mail.
- [ ] Integração com calendários.
- [ ] Integração com armazenamento externo.
- [ ] API pública.
- [ ] Webhooks.
- [ ] Integrações com sistemas corporativos.
- [ ] Integrações com fontes oficiais, quando permitidas.

## 4.3. White-label

- [ ] Personalização de logotipo.
- [ ] Personalização de cores.
- [ ] Domínio personalizado.
- [ ] Identidade visual por organização.
- [ ] Personalização do portal externo.

## 4.4. Expansão comercial

- [ ] Gestão de planos.
- [ ] Controle de assinaturas.
- [ ] Limites por plano.
- [ ] Gestão de cobrança.
- [ ] Área administrativa da plataforma.
- [ ] Métricas de utilização.
- [ ] Onboarding de novas organizações.

**Critério de conclusão:** plataforma preparada para expansão comercial, integração com outros sistemas e atendimento a organizações de diferentes portes.

---

# FUNCIONALIDADES FORA DO ESCOPO INICIAL

As funcionalidades abaixo não deverão consumir recursos durante a construção do MVP, salvo necessidade técnica devidamente justificada:

- Robôs complexos para portais de órgãos públicos.
- Integrações automatizadas com todas as juntas comerciais.
- Inteligência artificial avançada.
- Aplicativos nativos para celular.
- Sistema financeiro completo.
- Assinatura eletrônica proprietária.
- Integrações indiscriminadas com sistemas externos.

Essas funcionalidades poderão ser avaliadas futuramente.

---

# CRITÉRIOS GERAIS DE CONCLUSÃO

Uma funcionalidade só poderá ser considerada concluída quando:

1. Sua implementação estiver integrada à arquitetura.
2. Os dados forem persistidos corretamente, quando aplicável.
3. As permissões forem respeitadas.
4. As validações estiverem implementadas.
5. Os estados de carregamento, sucesso e erro estiverem tratados.
6. Os testes pertinentes forem executados.
7. Não houver erros críticos conhecidos.
8. A documentação estiver atualizada.

A existência de uma tela ou componente visual não representa, isoladamente, a conclusão de uma funcionalidade.

---

# CONTROLE DE EVOLUÇÃO

O roadmap deverá ser atualizado continuamente.

Cada item deverá refletir seu estado real:

- [ ] Não iniciado.
- [\~] Em desenvolvimento.
- [ ] Implementado e validado.

O Claude deverá atualizar este documento ao concluir etapas relevantes, sem antecipar entregas ou marcar funcionalidades não testadas como concluídas.

**Princípio central: construir um produto funcional, módulo por módulo, com qualidade técnica e consistência operacional.**
