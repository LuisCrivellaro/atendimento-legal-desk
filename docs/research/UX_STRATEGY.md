# Estratégia de UX: Manager ADV

27/11/2026. Para quem usa o sistema, o que precisa fazer e como o redesenho reduz atrito sem mudar regras.
Base: `CONTENT_INVENTORY.md` (telas e jornadas atuais), `WEBSITE_AUDIT.md` (atritos), `CREATIVE_DIRECTION.md`.

## Quem usa e em que situação

| Perfil (papel no sistema) | O que faz no dia | O que mais precisa |
|---|---|---|
| Advogada Sênior (`advogada_senior`), a Dra. Carolina | Aprova checklists e minutas, confirma protocolos, revisa notícias processuais, configura a Anne | Ver o que depende dela, aprovar com segurança, confiar no que a Anne faz |
| Advogado Júnior (`advogado_junior`) | Produz petições, faz a validação humana da auditoria | Caso organizado, documentos à mão, minuta e checklist sem ruído |
| Atendente/Assessora (`atendente`) | Responde clientes no WhatsApp, agenda, cobra documentos | Conversas rápidas, próximo passo claro, mensagens prontas |
| Operações (`operacoes`) | Protocolo, cadastros, ProJuris | Listas filtráveis, estado de sincronização confiável |
| Administrador (`admin`) | Integrações, canal, permissões | Diagnóstico claro, sem jargão desnecessário |

Contexto comum: computador de mesa ou notebook (1366×768 a 1920×1080), sistema aberto o dia todo, WhatsApp do
escritório como canal principal com os clientes. Não há uso no celular (decisão da Dra.).

## Objetivos de experiência

1. Saber o que fazer agora em menos de 5 segundos ao abrir qualquer tela.
2. Cada tarefa frequente com um caminho principal visível (sem procurar ícone).
3. Nenhuma dúvida sobre o que é real e o que é simulado, nem sobre o que já foi enviado ao cliente.
4. Mudar de tela sem perder o caso em que se está trabalhando.
5. Menos texto técnico; mais frases de escritório.

## Arquitetura de navegação proposta

O menu lateral continua (é o padrão que a equipe conhece). Mudanças:

| Hoje | Proposta | Por quê |
|---|---|---|
| "Assessor" no menu, "Painel de casos" no título | "Painel" nos dois | Um nome só |
| Fluxo do caso: Atendimento, Produção, Aprovações, Auditoria, Protocolo, Andamentos | Mantém a ordem e a linha; "Aprovações" vira "Revisões" (ou passa a aprovar a minuta ali, decisão da Dra.) | Hoje o nome promete uma ação que a tela não faz |
| Cadastros: Clientes | Mantém | |
| Contencioso: Processos, Andamentos processuais | Mantém; ícones próprios; visível só para sênior/admin | Hoje aparece para todos e termina em erro |
| Escritório: Treinamento de IA, Configurações, Integrações | "Treinamento da Anne", "Configurações" (com seções, incluindo Integrações, Canal e Agente, Automações) | Configuração hoje está espalhada em 2 telas e 2 modais |
| Badges amarelos e vermelhos | Âmbar para fila, vermelho só para prazo fatal; "Revisões" ganha badge | Cor com significado |

Busca e atalhos:
- `Ctrl+K` abre a busca rápida global (hoje o atalho só funciona dentro do Atendimento; a busca global não tem atalho).
- `?` mostra os atalhos existentes (Alt+↑/↓ nas conversas, Esc, `/` no compositor).
- Estado na URL: conversa aberta (já existe `?conversa=`), aba do painel do cliente, filtros e aba ativa, para poder
  voltar e compartilhar o link com a colega.

## Padrões que atravessam o sistema

1. **Cabeçalho do caso** fixo em Produção, Auditoria, Protocolo e Andamentos: cliente, código, área, responsável,
   aprovação e o fio das 10 etapas. Trocar de tela mantém o mesmo caso aberto (já existe `?caseId=`; padronizar).
2. **Uma ação principal por tela**, sempre no mesmo lugar (canto superior direito da área de trabalho), com as
   secundárias num menu "Mais ações".
3. **Centro de avisos** no lugar das faixas empilhadas, com prioridade (crítico, atenção, informação).
4. **Estados honestos de envio**: Rascunho, Enviando, Enviado (com recibo), Simulado (canal desligado), Falhou (confira
   antes de reenviar). Mesma pílula em todas as telas.
5. **Confirmação proporcional**: AlertDialog para o que é jurídico, irreversível ou vai ao cliente; "Desfazer" para
   ações internas reversíveis; nada para o resto.
6. **Detalhes técnicos sob demanda**: a frase principal diz o efeito ("Lembretes pausados"), "Ver detalhes" mostra
   rotina, horário e documentação.
7. **Vazios úteis**: dizem o que aparece ali e qual a próxima ação.
8. **Carregamento com skeleton** e barra fina no topo durante navegação.

## Jornadas: hoje e proposta

### 1. Responder um novo contato e marcar a consulta (Atendente)

| Hoje | Proposta |
|---|---|
| Abre Atendimento, escolhe a conversa, lê até 9 faixas antes das mensagens, procura o ícone de agenda ou a ação "Enviar horários" entre 6 caminhos | Abre a conversa; o "Próximo passo: Enviar horários" está no topo como botão principal; avisos ficam recolhidos com contagem; o compositor mostra as ações com rótulo no hover |
| Modo da Anne escondido num dropdown | Segmentado visível com os 4 modos |

### 2. Trato feito e coleta de documentos (Atendente)

| Hoje | Proposta |
|---|---|
| "TRATO FEITO" em caixa-alta com estilo próprio; progresso dos documentos só na aba Documentos | Botão primário normal "Registrar trato feito"; o fio avança para "Contrato assinado" quando o servidor confirma; contagem "3 de 6 documentos" visível no cabeçalho da conversa |

### 3. Da produção ao protocolo (Advogados)

| Hoje | Proposta |
|---|---|
| Quatro telas com o mesmo seletor de caso; aprovar a minuta fica em Produção, "Aprovações" só distribui responsável e prazo; Auditoria com 16 cartões abertos; Protocolo com botões "Simular" habilitados | Cabeçalho do caso compartilhado; barra de ações única por tela; Auditoria como checklist com progresso "x de 16" e filtro "só pendentes"; Protocolo em etapas verticais com o bloqueio explicado; botões de simulação desabilitados com motivo quando o canal real está ativo |

### 4. O dia da advogada sênior (Dra. Carolina)

| Hoje | Proposta |
|---|---|
| Painel longo, prazos em 4 lugares, gráficos com rótulos cortados | Painel em três faixas: Hoje (tarefas com ação direta, revisões pendentes, notícias processuais a aprovar) → Prazos e eventos (uma lista só) → Carteira (gráficos legíveis e tabela) |
| Notícias processuais em Aprovações e no Atendimento | Uma fila "Revisões" com minutas e notícias, filtrável, e o mesmo item acessível a partir da conversa |

### 5. Configurar e diagnosticar (Sênior/Admin)

| Hoje | Proposta |
|---|---|
| "Automações do atendimento" num modal estreito com rolagem horizontal; "Canal e Agente" noutro modal; Integrações e Configurações com informações que se contradizem | Configurações com navegação lateral: Meu perfil · Atendimento (automações, secretaria digital, mensagens oficiais) · Canal e Agente · Integrações (estado único e coerente por serviço) · Monitoramento da Anne · Log de auditoria · Avançado (endpoints n8n, só admin) |

## Textos (microcopy)

- Caixa de frase; verbo + objeto nos botões; sem "OK".
- Erro = problema + saída ("Não foi possível enviar. O WhatsApp não respondeu. Confira no celular antes de tentar de
  novo.").
- Placeholder com exemplo e terminado em `…` ("Ex.: 0001234-56.2026.5.02.0001…" só quando for exemplo, não rótulo).
- "Anne" em toda parte; "advogada responsável" em vez de identificadores de papel.
- Revisar com a Humanizer e com `/web-design-guidelines`.

## Como medir (sem inventar números)

Os indicadores abaixo devem ser coletados antes e depois de cada fase, a partir do log de auditoria e do tempo das
mensagens, quando a Dra. autorizar:

- Tempo entre a mensagem do cliente e a primeira resposta da equipe.
- Cliques/teclas para enviar horários a partir da abertura da conversa.
- Tempo entre "checklist aprovado" e "minuta aprovada".
- Quantidade de reenvios por "Falhou" e de ações simuladas executadas por engano.
- Opinião da equipe numa conversa curta após cada fase.

## Fora do escopo desta estratégia

Versão mobile, site institucional público, mudanças de regras de agenda, de aprovação, de permissões ou dos textos
oficiais.
