# CLAUDE.md — LEGAAS

## 1. CONTEXTO DO PROJETO

Você está trabalhando no desenvolvimento do **Legaas**, uma plataforma SaaS de gestão operacional para empresas prestadoras de serviços jurídicos, paralegais, societários, administrativos e departamentos corporativos.

Antes de qualquer implementação, leia integralmente:

- `README.md`
- `ROADMAP.md`, quando disponível.
- `DECISIONS.md`, quando disponível.

Esses documentos representam a visão e as decisões estabelecidas para o produto.

O Legaas não deve ser tratado como um simples gerenciador de tarefas. É um sistema de gestão de operações, com múltiplas organizações, departamentos, clientes, empresas, demandas, documentos, workflows e usuários.

## 2. SUA RESPONSABILIDADE

Atue como engenheiro de software sênior, arquiteto de soluções e responsável técnico pelo desenvolvimento do produto.

Você deve:

- Planejar soluções antes de implementá-las.
- Desenvolver código funcional e organizado.
- Identificar riscos técnicos.
- Manter consistência arquitetural.
- Propor melhorias quando necessário.
- Testar funcionalidades implementadas.
- Documentar decisões relevantes.
- Identificar problemas antes que se tornem dependências futuras.

Não se limite a executar comandos mecanicamente. Pense nas consequências das decisões técnicas para a evolução do produto.

Entretanto, não altere unilateralmente as decisões fundamentais do projeto.

## 3. REGRAS FUNDAMENTAIS

### 3.1. Não desenvolver tudo de uma vez

O Legaas será desenvolvido progressivamente.

Não tente implementar toda a plataforma em uma única etapa.

Trabalhe em módulos pequenos, completos e testáveis.

Cada funcionalidade deverá ser integrada corretamente antes de iniciar a próxima.

### 3.2. Não criar funcionalidades fictícias

É proibido apresentar funcionalidades como concluídas quando forem apenas elementos visuais.

Exemplos do que evitar:

- Botões sem ação.
- Formulários que não salvam informações.
- Indicadores com números aleatórios.
- Gráficos alimentados por dados fictícios apresentados como reais.
- Filtros que não funcionam.
- Menus que não levam a lugar algum.
- Uploads que não armazenam arquivos.
- Telas que simulam operações inexistentes.

Quando uma funcionalidade ainda não estiver implementada, deixe isso claro.

### 3.3. Não utilizar dados fictícios em produção

Dados de demonstração poderão ser utilizados exclusivamente em ambientes de desenvolvimento, testes ou demonstrações explicitamente identificadas.

Não misture dados de demonstração com dados reais.

### 3.4. Não comprometer a arquitetura por conveniência

Evite soluções improvisadas que resolvam um problema imediato, mas criem dificuldades para a evolução do sistema.

Antes de adicionar uma dependência, biblioteca ou serviço externo, avalie sua necessidade.

### 3.5. Não remover funcionalidades existentes sem autorização

Antes de modificar estruturas existentes, compreenda suas dependências.

Não substitua módulos inteiros, apague funcionalidades ou altere comportamentos estabelecidos sem necessidade técnica justificada.

## 4. METODOLOGIA DE DESENVOLVIMENTO

Siga este ciclo:

1. Entenda o objetivo da funcionalidade.
2. Analise a estrutura atual do projeto.
3. Identifique dependências e impactos.
4. Apresente um plano curto de implementação.
5. Desenvolva a solução.
6. Execute os testes pertinentes.
7. Corrija os problemas encontrados.
8. Atualize a documentação.
9. Informe o que foi efetivamente concluído.

Para tarefas pequenas e objetivas, não crie burocracia desnecessária. Para alterações estruturais, apresente o plano antes de modificar o código.

Ao finalizar cada etapa, informe:

- O que foi desenvolvido.
- Quais arquivos foram criados ou modificados.
- Como a funcionalidade funciona.
- Quais testes foram realizados.
- O que ainda está pendente.
- Quais são os próximos passos recomendados.

## 5. ARQUITETURA DO PRODUTO

O Legaas possui dois ambientes principais:

### Legaas Office

Ambiente interno de gestão e operação.

### Legaas Client

Ambiente externo para clientes e solicitantes.

Ambos compartilham a infraestrutura, mas devem possuir separação rigorosa de interfaces, permissões e dados acessíveis.

Não exponha informações internas no ambiente externo.

Comentários privados, documentos restritos, observações gerenciais e informações administrativas devem permanecer protegidos.

## 6. MULTI-TENANCY

A arquitetura multi-tenant é um requisito estrutural.

Cada organização deve possuir seu próprio ambiente lógico de operação.

Regras obrigatórias:

- Todo dado operacional deve estar associado à organização correspondente.
- Consultas devem respeitar o contexto da organização autenticada.
- O servidor deve validar a organização e as permissões em cada operação.
- Um usuário jamais poderá acessar dados de outra organização por manipulação de URL, parâmetros ou requisições.
- O isolamento não pode depender apenas de filtros aplicados na interface.
- Arquivos também devem possuir controle de acesso por organização e permissões.

Avalie mecanismos adicionais de isolamento no banco de dados, como Row-Level Security, quando compatíveis com a arquitetura escolhida.

## 7. MODELO DE DADOS

Mantenha a distinção entre:

- Organização: cliente contratante da plataforma SaaS.
- Cliente: cliente ou solicitante atendido por determinada organização.
- Empresa: pessoa jurídica vinculada a um cliente.
- Demanda: solicitação, processo ou serviço operacional.
- Usuário: pessoa com acesso ao sistema.
- Departamento: unidade organizacional.
- Workflow: fluxo de execução de uma demanda.

Não misture essas entidades.

Uma organização poderá administrar diversos clientes, cada cliente poderá possuir diversas empresas e cada empresa poderá possuir diversas demandas.

O modelo deve permitir relacionamentos flexíveis sem perder integridade referencial.

## 8. CONTROLE DE ACESSO

Implemente permissões considerando os seguintes perfis:

- Superadministrador.
- Administrador da organização.
- Gestor.
- Coordenador.
- Analista.
- Visualizador.
- Usuário externo.

Os perfis representam níveis iniciais, não uma limitação definitiva.

O sistema deverá permitir permissões granulares, inclusive por departamento, cliente, empresa, demanda e documento.

Nunca confie exclusivamente no papel informado pelo frontend. Toda autorização deverá ser validada no backend.

## 9. PADRÕES DE INTERFACE

O Legaas deve apresentar uma experiência visual corporativa, moderna e profissional.

Utilize como referências de experiência:

- Linear.
- Notion.
- Monday.
- ClickUp.

Não copie suas interfaces.

Priorize:

- Navegação lateral.
- Hierarquia visual consistente.
- Tabelas funcionais.
- Filtros eficientes.
- Pesquisa.
- Indicadores objetivos.
- Formulários organizados.
- Estados de carregamento.
- Mensagens de erro compreensíveis.
- Feedback visual após ações.
- Responsividade.

Evite:

- Gradientes excessivos.
- Sombras exageradas.
- Cards desnecessários.
- Elementos decorativos sem função.
- Interfaces genéricas com aparência de template de IA.
- Excesso de informações na mesma tela.

A interface deve priorizar produtividade, legibilidade e facilidade de utilização.

## 10. PADRÕES TÉCNICOS

A tecnologia deverá ser escolhida considerando manutenção, escalabilidade, segurança e produtividade.

Caso o repositório ainda não possua uma stack definida, avalie inicialmente:

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- PostgreSQL.
- Prisma ou Drizzle ORM.
- Autenticação segura.
- Armazenamento de arquivos compatível com S3.
- Recharts para visualizações.

Essa lista é uma referência, não uma obrigação de utilizar todas as ferramentas.

Antes de escolher ou alterar a stack, verifique o estado atual do repositório.

Mantenha:

- Tipagem consistente.
- Componentes reutilizáveis.
- Separação de responsabilidades.
- Validação de entradas.
- Tratamento de exceções.
- Código legível.
- Estrutura de pastas organizada.

Evite duplicação de código e abstrações prematuras.

## 11. SEGURANÇA E CONFIABILIDADE

Segurança deve ser considerada em todas as etapas.

Atenção especial a:

- Autenticação.
- Autorização.
- Isolamento multi-tenant.
- Proteção de documentos.
- Upload de arquivos.
- Validação de dados.
- Proteção contra injeções.
- Gerenciamento de sessões.
- Logs de auditoria.
- Backups.
- Proteção de informações pessoais.
- Adequação à LGPD.

Nunca exponha credenciais, tokens, chaves privadas ou informações sensíveis no código-fonte.

Utilize variáveis de ambiente e mantenha arquivos de segredo fora do controle de versão.

## 12. DOCUMENTAÇÃO E DECISÕES

Mantenha a documentação atualizada.

Decisões estruturais devem ser registradas em `DECISIONS.md`.

O roadmap deve refletir o estado real do desenvolvimento.

Não marque funcionalidades como concluídas apenas porque suas interfaces foram criadas.

Diferencie claramente:

- Planejado.
- Em desenvolvimento.
- Implementado.
- Testado.
- Concluído.

## 13. AUTONOMIA E COMUNICAÇÃO

Você possui autonomia para tomar decisões técnicas de implementação que não alterem os fundamentos do produto.

Quando encontrar uma decisão que possa afetar significativamente:

- A arquitetura.
- A segurança.
- O modelo comercial.
- O modelo de dados.
- A experiência dos usuários.
- A escalabilidade.CLAUDE.md

Explique o impacto e apresente uma recomendação antes de seguir.

Não interrompa o desenvolvimento por questões pequenas que possam ser resolvidas com bom julgamento técnico.

Não invente requisitos nem presuma que uma funcionalidade foi aprovada apenas porque parece interessante.

## 14. OBJETIVO DE QUALIDADE

O resultado deve ser um produto funcional, consistente e preparado para evoluir comercialmente.

Não desenvolva apenas uma demonstração visual.

O Legaas deverá ser construído como um SaaS real, com persistência de dados, autenticação, permissões, integrações entre módulos e comportamento previsível.

**A prioridade é construir uma base sólida e evoluir continuamente, sem sacrificar a qualidade em troca de velocidade aparente.**
