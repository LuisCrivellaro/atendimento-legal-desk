# Identidade da marca — CS Lawyers | Advocacia (no Manager ADV)

> Base para o redesenho visual do sistema interno. Separa a **essência da marca** (manter) das **escolhas de interface**
> (podem evoluir). **[C]** confirmado · **[I]** inferência · **[R]** recomendação.

## 1. Essência

| Dimensão | Leitura |
|---|---|
| Segmento | Escritório de advocacia boutique (Trabalhista e Cível/Família), titular Dra. Carolina Santos, OAB/SP 251.781 **[C]** |
| Promessa | "Do primeiro contato do cliente ao andamento do processo, com revisão da advogada em cada etapa." **[C]** (login) |
| Valores visíveis no produto | Rigor e revisão humana; ética OAB; nunca inventar dados, recibos ou horários; acolhimento sem juridiquês **[C]** (`README.md`, `ana-prompt.txt`) |
| Alcance | Brasil • Dubai • Portugal **[C]** |
| Personalidade | Sóbria, precisa, acolhedora, contemporânea; autoridade discreta, não ostentatória **[I]** |
| Tom de voz (cliente) | Caloroso, educado, natural, frases curtas, no máximo um emoji, sem juridiquês e sem gírias **[C]** (`ana-prompt.txt:61-68`) |
| Tom de voz (equipe, na UI) | Hoje: técnico e defensivo (muitos avisos de "simulado", nomes de rotina, códigos T04/T12.2). **[R]** Deve virar operacional e claro, mantendo a transparência sobre o que é real ou simulado. |

## 2. Assinatura (lockup)

**[C]** Não há logotipo gráfico: a marca é tipográfica.

```
CS LAWYERS | ADVOCACIA          ← EB Garamond 600, caixa-alta, tracking 0.045em; barra "|" em aqua (#00ACA7), peso 400
BRASIL • DUBAI • PORTUGAL       ← Inter 600, 11px, versalete, tracking 0.18em, cor primária/aqua
```

- Definição: `src/styles.css:207-209` (`.brand-lockup`, `.brand-bar`, `.brand-cities`).
- Uso: cabeçalho do sistema (`src/routes/_authenticated/route.tsx:76`), painel esquerdo do login (`src/routes/auth.tsx:87-90`),
  papel timbrado do DOCX ("CS LAWYERS | ADVOCACIA" + "BRASIL • DUBAI • PORTUGAL", `src/lib/legal/petition-docx.ts:17`).
- Variações de nome em uso: "CS Lawyers | Advocacia", "Equipe CS Advocacia", "Equipe CS Lawyers ⚖️", "Base própria CS.IA"
  (tela Clientes), "Manager ADV" (produto). **[R]** Padronizar: marca = CS Lawyers | Advocacia; produto = Manager ADV;
  assistente = Anne.
- **[C]** Favicon publicado é o **coração padrão da Lovable** (256×256), não um símbolo do escritório.

## 3. Paleta atual (tokens em `src/styles.css`)

### Marca (manter)
| Token | Hex | Papel |
|---|---|---|
| `--brand` | `#00ACA7` | Aqua da marca: barra do lockup, réguas, foco, gráficos |
| `--brand-pale` | `#E9F7F6` | Fundo das faixas de título (`section-title`) |
| `--petrol` / `--sidebar` | `#0F3533` | Petróleo profundo: menu lateral, painel do login |
| `--primary` | `#007F7B` | Aqua de ação (botões), 4,9:1 com branco |
| `--primary-hover` | `#006A67` | Hover de ação |
| `--document-aqua` | `#00ACA7` | Peças (Visual Law) |

### Neutros e semânticas
| Token | Valor | Observação |
|---|---|---|
| `--background` | `#F4F7F7` | Cinza-esverdeado muito claro |
| `--foreground` | `#141A1A` | Tinta |
| `--card` | `#FFFFFF` | Cartões |
| `--muted-foreground` | `#5B6B6B` | Texto secundário |
| `--border` / `--input` | `#D9E6E5` / `#CFDEDD` | Linhas |
| `--destructive` | `oklch(0.52 0.19 27)` | Vermelho |
| `--success` | `oklch(0.53 0.13 145)` | Verde |
| `--pending` | **`#FFE600`** | Amarelo-limão puro para pendências (badges, barras, rosca) — **ponto mais destoante da paleta** |
| Sidebar extras | `#164441`, `#1B4B48`, `#24524F`, `#3E6C69`, `#8FB3B0`, `#D3E6E4` | Escala do petróleo usada em hover/ativo/rótulos |

### Paleta "WhatsApp" dentro da conversa
`--zap-out #D9FDD3`, `--zap-in #FFFFFF`, `--zap-send #00A884`, `--zap-bar #F0F2F5`, fundo `#FEFCF6` + papel de parede de
ícones (`src/styles.css:279-291`). **[I]** Escolha deliberada de familiaridade (equipe vive no WhatsApp Web), mas
introduz um segundo verde e um segundo sistema visual.

### Modo escuro
**[C]** Tokens `.dark` são o padrão azul-ardósia do shadcn (não usam petróleo/aqua) e não há alternador visível.
**[R]** Ou remover, ou criar um modo escuro de marca (petróleo) — não é prioridade.

## 4. Tipografia

| Uso | Fonte | Fonte no código |
|---|---|---|
| Títulos (h1–h3), lockup, faixas de seção | **EB Garamond** 500/600/700 (Google Fonts) | `src/styles.css:70,190`; `__root.tsx:93` |
| Interface e texto | **Inter** 400/500/600 | `src/styles.css:71,189` |
| Peças jurídicas (preview) | Times New Roman 12pt | `--font-doc` |
| DOCX (timbrado) | Garamond | `petition-docx.ts:17-18` |

Escala: mínimo 12px (`--text-2xs`), 13px secundário (`--text-xs`), 14px leitura (`src/styles.css:65-69`).
**[C]** A demonstração tem um seletor para comparar 5 pares de fontes (Atual, Tradicional, Baskerville, Playfair,
Merriweather) — `tools/demo-navegador/spa/main.tsx:18-24` — indício de que a tipografia ainda estava em decisão.
**[I]** O par Garamond + Inter funciona bem e conversa com o papel timbrado; o problema não é a fonte, é a hierarquia
(títulos grandes em Garamond, corpo muito miúdo e denso).

## 5. Motivos visuais próprios (reaproveitáveis)

1. **Régua aqua + faixa clara** (`section-title`): barra vertical de 3px aqua sobre `#E9F7F6`. Está nas peças e na UI.
2. **Linha do fluxo do caso** no menu: conector vertical entre as 6 etapas (`.office-flow`, `src/styles.css:213-214`).
3. **Borda inferior aqua de 2px** no cabeçalho.
4. **Papel timbrado**: cabeçalho com lockup e cidades, rodapé com site/e-mail/telefone em aqua.
5. **Contraste petróleo × papel**: painel escuro com tipografia serifada clara (login).

## 6. Diretrizes para o redesenho (recomendações)

- **[R]** Manter: aqua `#00ACA7`, petróleo `#0F3533`, EB Garamond + Inter, lockup tipográfico, régua aqua.
- **[R]** Trocar o amarelo `#FFE600` por um âmbar sóbrio (ex.: família `#B7791F`/`#FDF3D8`) para pendências; reservar
  vermelho só para prazos fatais e erros.
- **[R]** Harmonizar a conversa com a marca (bolha de saída aqua-clara `#DDF2F0` já existe como `--bubble-out`) ou manter
  o verde do WhatsApp só nas bolhas, nunca em botões.
- **[R]** Criar favicon/monograma "CS" com a barra aqua.
- **[R]** Animação com personalidade "precisa e calma": transições curtas (150–250 ms), easing suave, nada de quiques;
  movimento para dar feedback (envio, salvamento, troca de etapa), não decoração.
- **[R]** Tom de interface: frases operacionais curtas ("Lembretes pausados — rotina do servidor parada"), detalhes
  técnicos atrás de "Ver detalhes".
