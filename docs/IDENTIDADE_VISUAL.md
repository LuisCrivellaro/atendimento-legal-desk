# Identidade visual do MANAGER ADV

Definida pela Dra. Carolina em 27/11/2026. Vale para todo desenvolvimento futuro. Se outro documento disser algo
diferente sobre cores ou marca, este prevalece.

## Nome e logo

- O nome da plataforma é sempre **MANAGER ADV**. Não usar "CS", "CS Lawyers" ou "CS Lawyers | Advocacia" como nome do
  sistema (títulos de aba, cabeçalho, login, manifesto, ícone).
- A logo oficial (quadro turquesa com "CS" em serifa branca e moldura preta) é só o **símbolo visual**. Não redesenhar,
  recolorir, cortar o desenho, trocar a fonte nem mudar a proporção (1029 × 1230).
- Arquivos:
  - `src/assets/brand/manager-adv-logo-original.webp`: arquivo recebido, sem alteração.
  - `src/assets/brand/manager-adv-logo.png`: o mesmo desenho, só sem a margem branca externa, 301 × 360 px. É o que a
    interface importa (`import logo from '@/assets/brand/manager-adv-logo.png'`, classe `.brand-logo`, definir só a
    altura).
  - `public/favicon.ico` (16/32/48), `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
    (fundo branco) e `public/site.webmanifest`: a logo centralizada num quadrado, sem distorção.
- Uso atual: cabeçalho (logo 36px + "MANAGER ADV" em EB Garamond), painel esquerdo do login (logo + nome), favicon e
  ícone do aplicativo.
- "CS Lawyers | Advocacia" continua sendo o nome do **escritório**: aparece onde o texto fala do escritório (descrição,
  "assistente virtual CS Lawyers", "Mensagens oficiais (CS Lawyers)"), nas mensagens aos clientes e no papel timbrado
  das petições. Isso não muda o nome da plataforma.

## Cor principal

**Turquesa da logo: `#00C9CB`.** Extraído da imagem oficial: mediana de 256.553 pixels da área turquesa (os valores
mais frequentes, `#00C8CB` e `#00C9CD`, variam só pela compressão WebP).

Escala no mesmo matiz (OKLCH 196°), em `src/styles.css`:

| Token | HEX | Contraste com branco | Uso |
|---|---|---|---|
| `--turquoise-50` | `#EEFAFA` | — | Fundo de seleção, `--accent`, `--secondary`, `--brand-pale` |
| `--turquoise-100` | `#DCF5F5` | — | Bolha de mensagem enviada |
| `--turquoise-200` | `#BAEDEC` | — | Seleção de texto |
| `--turquoise-300` | `#72E3E4` | — | Reserva (realces sobre fundo escuro) |
| `--turquoise-400` | `#3ED6D7` | — | Reserva |
| `--turquoise-500` | `#00C9CB` | 2,1:1 | **A cor da logo** (`--brand`): régua do cabeçalho, indicador do menu ativo, réguas de seção, abas, detalhes sobre fundo escuro |
| `--turquoise-600` | `#06A7A9` | 2,9:1 | Gráficos (`--chart-1`) |
| `--turquoise-700` | `#017F80` | 4,8:1 | **Ação**: botões primários, links, anel de foco (`--primary`, `--ring`, `--brand-strong`) |
| `--turquoise-800` | `#066768` | 6,7:1 | Hover do botão primário |
| `--turquoise-900` | `#014A4B` | 10,1:1 | Texto sobre os fundos claros turquesa; série escura de gráfico |
| `--turquoise-950` | `#082B2B` | 15,1:1 | Menu lateral e painel do login (`--sidebar`, `--petrol`) |

Regra de contraste: `#00C9CB` não serve para texto nem como único indicador de estado sobre fundo claro (2,1:1). Nesses
casos usar `--brand-strong`/`--primary` (`#017F80`). Sobre o menu escuro, `#00C9CB` tem contraste alto e é a cor de
destaque.

## Neutros (branco, cinza e grafite)

Cinzas com um toque mínimo do matiz da marca: `--graphite-25 #F7FBFB` · `50 #F1F7F7` (fundo) · `100 #E8F0EF`
(`--muted`) · `200 #D8E2E2` (bordas) · `300 #C2CDCD` · `400 #95A1A1` · `500 #717D7D` · `600 #5A6666` (texto
secundário, 5,5:1 no fundo) · `700 #3F4A4A` · `800 #2A3232` · `900 #192020` (texto principal, 15,3:1). Superfícies de
trabalho em branco `#FFFFFF`. Borda de campo `--input #7D8989` (3,6:1, para o campo ser identificável).

## Cores semânticas (preservadas)

Sucesso `oklch(0.53 0.13 145)` · alerta/pendência `#FFE600` com texto `#0D0D0D` · erro `oklch(0.52 0.19 27)`. Não
substituir por turquesa. Os badges do menu mantêm a cor própria também no item ativo.

## Onde cada coisa vive

- Todos os valores ficam em `src/styles.css` (`:root` e o mapeamento `@theme inline`, que gera as classes
  `bg-turquoise-700`, `text-brand-strong`, `bg-graphite-50`, `text-sidebar-muted` etc.).
- Componentes usam tokens semânticos (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-brand`,
  `var(--avatar-n)`, `var(--zap-*)`). **Nenhum HEX solto em componente**: se faltar uma cor, crie o token em
  `src/styles.css` e documente aqui.
- Conversa do Atendimento: formato do WhatsApp nas cores do Manager ADV (`--zap-*` dentro de `.attendance-chat`); só os
  tiques azuis de "lida" seguem a convenção do WhatsApp.
- Avatares de iniciais: `--avatar-1` a `--avatar-8`.

## Exceção deliberada: peças jurídicas

A prévia Visual Law e o DOCX das petições usam `--document-aqua #00ACA7` e o timbre "CS LAWYERS | ADVOCACIA". São
documentos do escritório entregues à Justiça, não telas da plataforma, e o padrão vem dos prompts jurídicos
(`src/lib/legal/visual-law.ts`, `src/lib/legal/prompts/`). Mudar isso exige pedido da Dra.

## Pendências fora desta atualização

- Papel de parede da conversa (`src/assets/atendimento-wallpaper.webp`), que parece ser arte do WhatsApp: troca ainda
  depende de decisão.
- Tokens `.dark` (modo escuro) não usados: não foram adaptados.
- Barra da demonstração local (`tools/demo-navegador/spa/main.tsx`) ainda usa as cores antigas; é ferramenta de
  desenvolvimento, não aparece no sistema.
