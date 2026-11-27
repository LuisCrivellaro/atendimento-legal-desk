# Resumo da pesquisa — Etapa 01 (Manager ADV · CS Lawyers | Advocacia)

> 27/11/2026. Fonte de contexto permanente para as próximas etapas e para outras sessões/agentes.

## Escopo decidido pela Dra.

- **Não** é um site novo nem reconstrução: é **melhorar o visual, a intuitividade e as animações** do sistema
  existente em <https://atendimento-legal-desk.lovable.app>.
- **Só desktop**: não há versão mobile e não é necessária.
- Nenhuma regra de negócio, permissão ou gate jurídico muda (ver `AGENTS.md` e `README.md`).

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [COMPANY_PROFILE.md](COMPANY_PROFILE.md) | Escritório, titular (Dra. Carolina Santos, OAB/SP 251.781), áreas, consulta, contatos, equipe, integrações, pendências |
| [BRAND_IDENTITY.md](BRAND_IDENTITY.md) | Essência, lockup tipográfico, paleta/tokens, tipografia, motivos visuais, tom de voz, diretrizes |
| [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) | Rotas, telas, seções, botões, formulários, integrações, links, jornadas, o que preservar |
| [ASSETS_INVENTORY.md](ASSETS_INVENTORY.md) | Favicon, papel de parede, og:image, fontes, ícones, timbrado — origem, direitos e destino |
| [WEBSITE_AUDIT.md](WEBSITE_AUDIT.md) | Notas por dimensão, pontos positivos, atritos por tela, animação, desempenho, acessibilidade, bugs |
| [REDESIGN_OPPORTUNITIES.md](REDESIGN_OPPORTUNITIES.md) | Princípios, pré-requisitos, ganhos rápidos, sistema visual, plano de animação, melhorias por tela, fases, decisões pendentes |
| [capturas/](capturas/) | 38 capturas "antes" (login e 404 publicados; telas internas da demonstração com dados fictícios) |

## O que aprendemos sobre a empresa

- **CS Lawyers | Advocacia**, escritório da **Dra. Carolina Santos (OAB/SP 251.781)**, presença **Brasil • Dubai •
  Portugal**, áreas **Trabalhista** e **Cível/Família**; consulta inicial **online, gratuita, 30 min, via Meet**;
  site `carolinasantos.com.br`; Instagram `carolinasantoslawyer`. **[C]**
- O **Manager ADV** é o sistema interno da equipe: atendimento pelo WhatsApp com a assistente virtual **Anne**,
  produção de petições com IA e revisão humana, auditoria, protocolo, andamentos, clientes e contencioso (ProJuris).
- Valores que o produto materializa: revisão humana em cada etapa, ética OAB, nunca inventar recibos/horários,
  linguagem acolhedora sem juridiquês.
- Identidade: **tipográfica** (EB Garamond + Inter), **aqua `#00ACA7`** e **petróleo `#0F3533`**, régua aqua — a mesma
  do papel timbrado das peças.

## Principais problemas do sistema atual

1. **Quase sem animação** e sem skeletons: a interface parece estática.
2. **Amarelo-limão `#FFE600` em tudo** (badges, avisos, barras), fora da paleta e sem hierarquia.
3. **Sobrecarga no Atendimento**: até ~9 faixas de aviso empilhadas e 6 mecanismos de ação rápida com ícones sem rótulo.
4. **Organização confusa**: prazos repetidos 4× no Painel; "Aprovações" não aprova; dois "Andamentos"; seletor de caso
   em telas globais; configurações espalhadas em modais estreitos e em três telas.
5. **Jargão técnico exposto** (rotinas, erro 500, Inngest, códigos T, papéis crus, endpoints) e status contraditórios
   sobre integrações.
6. **Marcas de terceiros e inglês**: favicon e selo da Lovable, "Continue with Lovable", 404/erro em inglês.
7. **Bugs**: data de perícia deslocada (11/11 14h30 → "10/11 21:00") e eventos passados contados no Painel.
8. **Código de tela em linhas únicas** (até 8.717 caracteres), o que encarece o redesenho — refatorar antes.

## Maiores oportunidades

1. **Sistema de movimento** discreto e consistente (páginas, abas, listas, contadores, envio de mensagem, checklists).
2. **Centro de avisos** único no Atendimento + "Próximo passo" como ação principal.
3. **Cabeçalho de caso + stepper visual** das 10 etapas compartilhado por Produção, Auditoria e Protocolo.
4. **Paleta semântica** (âmbar/vermelho/verde/aqua) e **componentes de status** com ícone + texto.
5. **Configurações reorganizadas** numa página com navegação lateral (Atendimento, Canal, Integrações, Monitoramento, Log).
6. **Painel em 3 faixas** (Hoje → Prazos e eventos → Carteira).
7. **Marca própria**: favicon/monograma, telas de erro, login com microanimação.

## Informações pendentes / não verificadas

- Área autenticada **real** não acessada (sem login); telas internas vistas na demonstração com o código local
  (`79208ea`), que pode estar à frente do publicado.
- Ficha de processo do Contencioso e telas com dados reais (carteira ProJuris, monitoramento) só pelo código.
- Endereço físico, CNPJ, logo oficial, equipe real, manual de marca.
- `carolinasantos.com.br`, Instagram e LinkedIn não foram visitados.
- Origem/licença do papel de parede da conversa (parece arte do WhatsApp).
- Decisões da Dra. listadas em `REDESIGN_OPPORTUNITIES.md` §9.

## Como reproduzir a navegação da demonstração

A demonstração (`tools/demo-navegador`) não abre com o código atual sem adaptações. Nesta etapa foi usada uma
configuração temporária fora do versionamento: `node_modules/.demo-vite.config.ts` (igual à do `tools/`, sem
`vite-plugin-singlefile`, com aliases para `node_modules/.demo-stubs/` — stub de `@lovable.dev/mcp-js`, de
`node:crypto` e um invólucro do Supabase falso com `not/lt/gt` e métodos extras) e `.claude/launch.json`
("demo-navegador", porta 8090, `node node_modules/vite/bin/vite.js --config node_modules/.demo-vite.config.ts`).
Login da demo: qualquer e-mail e senha de 6+ caracteres.
