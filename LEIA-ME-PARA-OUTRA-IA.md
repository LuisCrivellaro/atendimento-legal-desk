# Manager ADV — CS Lawyers (pacote de continuação)

Este arquivo é a porta de entrada para quem vai continuar o projeto em outra IA
ou fora da Lovable. Leia esta página, depois `AGENTS.md` (regras obrigatórias)
e `roadmap.md` (o que já foi feito e o que está pendente).

## O que é

Sistema interno de operação jurídica do escritório CS Lawyers: Atendimento,
Produção, Auditoria, Protocolo, Andamentos, Treinamento de IA, Clientes,
Aprovações, Painel de casos e Configurações, com perfis de acesso
(advogada sênior, advogado júnior, atendente, operações, administrador).

## Stack

- TanStack Start v1 (React 19, Vite 7), TypeScript, Tailwind CSS v4
  (configurado em `src/styles.css` com `@theme`, sem `tailwind.config.js`).
- Rotas em `src/routes`; layout raiz em `src/routes/__root.tsx`;
  páginas do escritório em `src/routes/_authenticated/` (portão de login).
- Backend: Lovable Cloud. Tabelas, funções e gatilhos do app ficam
  em `public`; migrações SQL versionadas em `drizzle/migrations/`.
- Testes: Vitest (`bunx vitest run`), em `src/test/`.

## Como rodar

```sh
cp .env.example .env   # preencha com a URL e a chave publicável do seu backend
bun install
bun run dev
```

Este pacote inclui `.env.example`, mas não inclui credenciais nem `.env`.
Configure seu próprio ambiente e suas credenciais de servidor. O código-fonte
não exporta os dados salvos, as contas nem os documentos privados da hospedagem;
esses dados precisam de um procedimento de transferência separado. Os serviços
de IA e autenticação dependem da configuração compatível no novo ambiente.

## Regras que não podem ser quebradas

As regras completas estão em `AGENTS.md`. As críticas:

1. Chamadas de IA só em server functions (`src/lib/*.functions.ts`), via
   Lovable AI Gateway. A chave nunca vai para o navegador.
2. Integrações externas passam por `src/services/n8n.ts` (modo demonstração).
   O front-end nunca chama serviço de terceiro direto.
3. Perfis só em `user_roles`; novos usuários entram como `atendente` e recebem
   os casos-modelo. Nunca Promover a si mesmo pela interface.
4. Aprovações de checklist e minuta são validadas no servidor contra
   `user_roles` e um hash de revisão do material (`legal_approvals`). Editar o
   material invalida a aprovação. Atendente, operações e administrador sem
   perfil jurídico não aprovam.
5. Documentos originais são append-only; contratos cliente/escritório não
   entram no pacote judicial; comparar conteúdo, não nomes; dúvida exige revisão
   humana; PDF até 10.000 KB; máximo de 10 fotos por PDF.
6. Painel geral do escritório só para advogada sênior ou administrador; demais
   perfis leem apenas os próprios casos.

## O que ainda não funciona de verdade

Tudo marcado como pendente em `roadmap.md`, em resumo:

- ProJuris (clientes, processos, documentos, andamentos) — depende de
  credenciais, código do escritório e endereço da API.
- ZapSign, Mercado Pago e UltraMsg — contratos prontos, ativação depende de
  credenciais privadas e da confirmação do fluxo.
- Claude — preparado como contrato de integração, sem chamada de inferência.
- Lembretes de automação só existem enquanto a conversa está aberta.
- Protocolo, autuação e avisos externos continuam demonstrativos.

## Onde procurar

- Regras de negócio puras: `src/lib/approval-rules.ts`, `assessor.ts`,
  `atendimento.ts`, `office.ts`, `clients.ts`, `dashboard.ts`,
  `integration-readiness.ts`, `src/lib/legal/visual-law.ts`.
- Funções de servidor (IA, banco, integrações): `src/lib/*.functions.ts`,
  `src/lib/legal/ai.server.ts`.
- Telas: `src/routes/_authenticated/*.tsx` e `src/components/office/`.
- Prompts jurídicos controlados no servidor: `src/lib/legal/prompts/*.txt`.
- Estado de integrações e contratos: `src/services/integration-contracts.ts`,
  `docs/integrations.md`.

## Atualização desta versão — 20/10/2026

Inclui a aba ProJuris no painel de detalhes da conversa do Atendimento,
com processos, andamentos, prazos e arquivos locais do cliente selecionado,
e os testes correspondentes. A aba não representa importação real do ProJuris.

## Atualização — mensagens prontas do Atendimento (20/10/2026)

Mensagens prontas reorganizadas: sugestões por etapa acima da caixa de mensagem,
painel com busca e categorias, atalho "/" no próprio campo e editor para criar
e editar mensagens com variáveis. Regras em `src/lib/respostas-prontas.ts`,
interface em `src/components/office/quick-replies.tsx`, testes em
`src/test/respostas-prontas.test.ts`. As mensagens criadas ficam no perfil de
cada usuário (`respostasProntas` na raiz do `office_workspace`).

## Onde paramos — 20/10/2026 (troca de conta)

**Estado:** foco atual no módulo Atendimento. 60 testes aprovados, compilação
sem erros. Integrações (n8n, WhatsApp/UltraMsg, ZapSign, Mercado Pago, ProJuris)
continuam simuladas; `src/services/n8n.ts` não faz chamadas reais e ainda não
existe entrada para mensagens recebidas do cliente.

**Demonstração:** arquivo único `manager-adv-demonstracao.html`, que abre direto
no navegador (dados fictícios, IA simulada). Fica fora do projeto para não pesar
o build; para gerar de novo após mudanças, ver `tools/demo-navegador/LEIA-ME.md`.

**Plano de testes do Atendimento:**

1. Fase 1 (em andamento) — equipe testa o fluxo na demonstração com 5 roteiros
   (Rogério: primeiro contato e horários; Paulo: contrato até assinado; Mariana:
   faltantes, anexo e checklist; Helena: aba ProJuris e sugestão da IA; criar
   mensagem pronta com `{data}` e usar por `/`). Anotar tempo, travamentos e
   sugestões por roteiro.
2. Fase 2 — sistema real (Lovable Cloud: login e banco reais), contas da equipe,
   perfis definidos em `user_roles` pelo painel do banco, ainda em modo
   demonstração.
3. Fase 3 — ponte real com o n8n: envio pelo servidor (segredo fora do
   navegador), rota de recebimento de mensagens do cliente (identificada pelo
   telefone), simulador de mensagem recebida e workflows n8n para importar;
   depois UltraMsg num chip de teste e só então o WhatsApp do escritório.
   Lembretes automáticos devem passar para o n8n (hoje só rodam com a conversa
   aberta).

**Problemas encontrados na fase 1 (corrigidos em 21/10/2026):**

- Paulo: "Lembrar assinatura" fica bloqueado com "Link não registrado" quando o
  contrato foi enviado fora do sistema; falta campo para colar o link.
- Horários enviados ao cliente saem com segundos ("21/10/2026, 09:00:00").
- Cliente ativo sem consulta registrada (Helena) recebe "Enviar horários" como
  próximo passo; para cliente ativo deveria ser responder/acompanhar.
- Celular: cabeçalho do topo se sobrepõe à busca e aos filtros do Atendimento.
- Textos amarelos (ex.: "Checklist pendente") com pouco contraste em fundo claro.

**Repositório:** github.com/LuisCrivellaro/Manager-ADV — o código foi enviado
como ZIP; descompactar o conteúdo na raiz do repositório e apagar o `.zip`.
O projeto no Lovable ainda não está ligado a esse repositório.

## Atualização — correções da Fase 1 (21/10/2026)

Horários exibidos em America/Sao_Paulo sem ISO, segundos ou ano, com reconhecimento de respostas naturais e rejeição de ambiguidades; registro/correção de links HTTPS de contratos enviados fora do sistema e bloqueio de mensagens com link ausente; clientes ativos seguem para resposta ou acompanhamento na aba ProJuris. Cabeçalho e Atendimento compartilham altura com área segura no celular, e pendências usam fundo #FFE600 com texto #0D0D0D. Permissões, aprovações, hash de revisão, banco e integrações permanecem inalterados, em demonstração.

