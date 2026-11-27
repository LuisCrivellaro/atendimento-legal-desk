# Inventário de materiais visuais — Manager ADV

> **Atualização de 27/11/2026:** a identidade oficial agora é a do MANAGER ADV, com a logo "CS" e o turquesa `#00C9CB`. Ver `../IDENTIDADE_VISUAL.md`, que prevalece sobre as cores e o lockup descritos abaixo (registro histórico da Etapa 01).

> Levantado em 27/11/2026. O sistema quase não usa imagens: a marca é tipográfica e a interface é feita de
> componentes (shadcn/ui + Tailwind) e ícones. **[C]** confirmado · **[?]** origem/direitos a verificar · **[R]** recomendação.

## 1. Arquivos de imagem e ícone

| Material | Local / URL | Formato e tamanho | Origem | Direitos / qualidade | Destino no redesenho |
|---|---|---|---|---|---|
| Favicon | `public/favicon.ico` · <https://atendimento-legal-desk.lovable.app/favicon.ico> | ICO 256×256, 20 KB | Template Lovable (commit `dad00cb`, 16/10/2026) **[C]** | É o **coração da Lovable**, não representa o escritório | **Substituir** por monograma CS (aqua + petróleo) em SVG + ICO + PNG 180/512 **[R]** |
| Papel de parede da conversa | `src/assets/atendimento-wallpaper.webp` (usado em `src/styles.css:279`) | WebP, 111 KB, retrato, desenhos lineares bege claro | Adicionado no commit `6464107` (22/10/2026, "Changes"), origem não documentada **[?]** | **Aparenta reproduzir o papel de parede de "doodles" do WhatsApp (Meta)**; sem registro de licença | **Substituir** por padrão próprio (ex.: motivos sutis em aqua/petróleo, balanças, folhas de papel) ou fundo liso **[R]** |
| Imagem de compartilhamento (og:image / twitter:image) | `https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/lovp_6j57y9d7n79nvtp00b4kte27dk/aec9dd3f91ad59833bf61f2a4d50f254_1795788219114.png` | PNG gerado pela Lovable | Captura automática da Lovable **[C]** | Sem controle editorial | Opcional: definir imagem própria; como o sistema é interno, pode ficar sem **[R]** |
| Selo "Edit with Lovable" | injetado no site publicado (link `lovable.dev/projects/…`) | — | Lovable **[C]** | Aparece para qualquer visitante | Ocultar nas configurações da Lovable, se o plano permitir **[R]** |
| Botão "Continue with Lovable" | `@lovable.dev/cloud-auth-js/styles.css`, `src/routes/auth.tsx:170-176` | Logo e estilo da Lovable | Biblioteca Lovable **[C]** | Marca de terceiro, texto em inglês | Manter só se o login Lovable for necessário; traduzir/neutralizar **[R]** |
| Logotipo do escritório | — | — | **Não existe arquivo** no repositório **[C]** | — | Pedir à Dra. o logo oficial, se houver; senão criar lockup em SVG a partir do tipográfico **[R]** |
| Fotos, vídeos, ilustrações | — | — | **Nenhum** **[C]** | — | Não há o que reaproveitar |
| Capturas desta pesquisa | `docs/research/capturas/*.jpg` (38 arquivos, ~1,4 MB) | JPG 800×500 (redução de 1440×900) | Feitas nesta etapa; telas internas com **dados fictícios** da demonstração | Uso interno de referência | Referência "antes" do redesenho |

## 2. Tipografia (fontes web)

| Fonte | Pesos | Carregamento | Licença |
|---|---|---|---|
| EB Garamond | 500, 600, 700 | Google Fonts (`src/routes/__root.tsx:93`) | SIL Open Font License **[C]** |
| Inter | 400, 500, 600 | Google Fonts | SIL Open Font License **[C]** |
| Times New Roman | — | sistema (prévia das peças) | Fonte do sistema operacional |
| Garamond | — | dentro do DOCX gerado (`src/lib/legal/petition-docx.ts`) | Depende da máquina que abre o DOCX |
| Só na demonstração: Libre Baskerville, Source Sans 3, Playfair Display, Lato, Merriweather, Roboto, Tinos, Arimo | — | `tools/demo-navegador/spa/index.html` | OFL/Apache (Google Fonts) |

**[R]** Considerar hospedar as duas fontes localmente (ou `font-display: swap` já está na URL) para não depender do
Google no carregamento; pesos 700 da Garamond quase não são usados.

## 3. Ícones

- **lucide-react** (licença ISC) em todas as telas **[C]**. Ícones do menu: Compass, MessageCircle, FileText,
  ClipboardCheck, ShieldCheck, Landmark (2×), Activity (2×), Users, Brain, Settings, Plug (`src/components/app-sidebar.tsx`).
- **[R]** Trocar os ícones repetidos (Processos ≠ Protocolo; Andamentos processuais ≠ Andamentos) e padronizar
  espessura/tamanho.

## 4. Gráficos

- **recharts** no Painel (4 gráficos) com cores `--chart-1…5` (aqua, verde, amarelo, vermelho, petróleo) **[C]**.

## 5. Materiais de marca em documentos gerados

- **Papel timbrado do DOCX** (`src/lib/legal/petition-docx.ts:17-18`): cabeçalho "CS LAWYERS | ADVOCACIA" +
  "BRASIL • DUBAI • PORTUGAL" com régua aqua; rodapé "CS LAWYERS | carolinasantos.com.br" + e-mail e telefone. **[C]**
- **Prévia Visual Law** (`src/components/office/petition-preview.tsx`, classes `.legal-*` em `src/styles.css:220-235`):
  folha A4, Times 12pt, títulos aqua, faixa clara com régua. **[C]** → **Preservar** (é identidade do escritório).
- Skill do escritório "formatacao-cs-lawyers" (fora do repositório) define o padrão das peças; não foi lida nesta etapa **[?]**.

## 6. Materiais pendentes (pedir à Dra.)

1. Logotipo/monograma oficial em vetor (SVG/AI/PDF), se existir.
2. Manual de marca ou referência de cores usada no site `carolinasantos.com.br` e no Instagram.
3. Foto profissional da Dra. (só se for desejada no perfil/login — não é necessária).
4. Autorização para substituir o papel de parede atual.
