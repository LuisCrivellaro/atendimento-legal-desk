# Auditoria do front-end — MANAGER ADV (antes do redesenho completo)

27/11/2026, depois da identidade turquesa (`f6273f3`) e da fundação/fases 2–5 (`47957d0`). Medido na demonstração
local (`tools/demo-navegador`, dados fictícios, sem dados de clientes reais) a 1366 × 768 e 100% de zoom. Capturas
em `research/capturas/antes-redesign-1366/`. Auditoria anterior, mais ampla: `research/WEBSITE_AUDIT.md`.

## Medidas

| Elemento | Medido | Problema |
|---|---|---|
| Cabeçalho global | 64px de altura | Alto para uma ferramenta de trabalho; meta 56px |
| Menu lateral | 255px aberto, 48px recolhido | Largo demais; recolhido estreito demais para ícone + badge |
| Título de página (H1) | 38px, EB Garamond | Desproporcional; meta 22–24px |
| Subtítulos de seção (H3) | 20px, faixa com fundo e régua | Muitas faixas iguais formam "caixas dentro de caixas" |
| Números de destaque | 30px | Competem com o título; meta 22–24px |
| Botões e campos | 36px | Dentro da faixa (32–38px) |
| Item do menu | 32px | Adequado |
| **Atendimento: área das mensagens** | **482 × 189px** de 704px úteis | A conversa é a menor área da tela |
| Atendimento: cabeçalho da conversa | 93px | Quebra em duas linhas por falta de largura |
| Atendimento: bloco "Precisa de atenção" aberto | 263px | Empurra as mensagens; aberto por padrão |
| Atendimento: compositor | 76px + linha de chips | Aceitável, mas os chips somam mais uma linha |
| Atendimento: lista de conversas | 288px, item de 88px | Itens altos; avatar 44px |
| Atendimento: painel do cliente | 340px fixo | Sem ajuste de largura |
| Overflow horizontal | não (1351 = largura útil) | — |

## Problemas visuais (por tipo)

- **Proporção:** títulos e números grandes demais para o resto; muito espaço vertical antes do conteúdo útil.
- **Amarelo `#FFE600`:** badges do menu, pílulas "N pendência(s)", barras, rosca do gráfico, faixas de aviso. É a
  cor mais forte da tela e cansa a vista; agora vetado pela Dra.
- **Faixas repetidas:** o utilitário `section-title` (régua + fundo) aparece em quase todo título de seção.
- **Atendimento:** informação administrativa ocupa mais altura que o histórico; cabeçalho quebra; três colunas fixas
  disputam 1366px com o menu.
- **Tabelas:** estilos diferentes por tela (cabeçalho, altura de linha, ações).
- **Indicadores (KPIs):** fileiras longas de números soltos com rótulos pequenos.
- **Densidade:** telas de formulário (Auditoria, Protocolo) muito espaçadas; Painel longo.

## O que já está bom e fica

Identidade turquesa e logo; centro de avisos (estrutura); fio das etapas; skeletons; confirmações próprias;
transições curtas; formato WhatsApp das bolhas; atalhos de teclado.

## Referências de qualidade usadas

Linear (proporção e densidade), Notion (hierarquia e leitura), Attio e Stripe (tabelas e dados), Raycast
(consistência e microinterações), WhatsApp Web e Intercom (caixa de entrada com três painéis). Não foram copiadas;
os princípios aplicados estão em `DESIGN_SYSTEM.md`. As páginas de produto dessas ferramentas exigem conta, então o
estudo foi feito a partir do conhecimento desses padrões, sem navegação logada.
