# Biblioteca oficial e obrigatória de mensagens — CS Lawyers (26/11/2026)

Os 19 textos oficiais enviados pela advocacia estão no sistema como modelos determinísticos
(`src/lib/atendimento/biblioteca/`). A Anne usa a inteligência só para reconhecer a situação e escolher o modelo; o texto
nunca passa pelo modelo de IA. A única mudança permitida é trocar os campos entre colchetes por dados reais e
verificados (e converter Markdown para o WhatsApp, sem mudar o que aparece).

## Arquivos

| Arquivo | Papel |
|---|---|
| `mensagens-oficiais.ts` | Os 19 textos (versão 1), com ID, gatilho, condições, fonte de cada campo, ativação, aprovação e onde está ligado. |
| `renderizar.ts` | Preenchimento estrito: campo faltando, vazio, com quebra de linha ou colchete → nada sai. Versões aprovadas, ativação, conversão para o WhatsApp, detecção de campo pendente. |
| `selecao.ts` | Escolha por situação e conferência de compatibilidade ("Bom dia", "hoje", "amanhã", link do Meet), `[nome]` só do cadastro, política anti-redundância. |
| `biblioteca.functions.ts` | Leitura para a equipe; nova versão, ativação e escolha da consulta paga só por sênior/admin, com histórico e auditoria. |
| `components/office/biblioteca-mensagens.tsx` | Tela "Mensagens oficiais" dentro de Automações do atendimento. |

## Onde cada modelo está ligado

| Modelo | Situação | Como entra |
|---|---|---|
| 01 Lembrete do dia | Lembrete das 08:00 | Substitui o lembrete anterior. Exige nome do cadastro e envio antes das 12h ("Bom dia"); senão, aviso para a equipe e nada sai. Não pede mais SIM/NÃO, então não grava consentimento de cancelamento: um "não" do cliente passa pela pergunta e confirmação de cancelamento. |
| 02 Confirmação do dia | Confirmação de presença (padrão 2 h antes, configurável), de manhã | Texto automático antes do meio-dia. |
| 08.2 Confirmação de agendamento | Confirmação de presença (padrão 2 h antes), a partir do meio-dia | Texto automático da tarde (02 diz "Bom dia"). |
| 03 Fora do horário | Cliente ativo escreve fora do expediente (seg–sex 8h–18h) | Só com a automação "Resposta fora do horário" ligada (desligada por padrão); uma vez por período; nesse período a equipe responde. |
| 05 Documentos para o contrato | Botão TRATO FEITO | Substitui o texto anterior. Sem nome do cadastro, o Trato feito para antes de criar a pasta e avisa a equipe. |
| 06 Reagendamento | Reagendamento conduzido pela Anne (secretaria digital) | Só quando há dois horários livres **hoje** (o texto diz "Hoje"); senão, a lista de opções verificadas. |
| 07.1 Primeiro atendimento gratuito | Primeira resposta a lead novo | Só quando o lead já disse o nome e os dois horários são amanhã; senão, a saudação aprovada anterior. |
| 07.2 / 07.3 Consulta paga | — | Bloqueadas até a advogada escolher a versão e definir quem é elegível. A Anne nunca escolhe entre elas. |
| 08.1 Agendamento confirmado | Reserva ou remarcação confirmada na agenda | Só de manhã e quando não há link do Meet a entregar (o texto oficial não traz o link); senão, a confirmação aprovada anterior, com o link real. Funil internacional mantém o próprio texto. |
| 09 Checklist trabalhista | — | Manual: a equipe copia na tela de Mensagens oficiais. |
| 10.1 / 10.2 Instagram / LinkedIn | Cliente pede o perfil | Anne no modo Automático responde só o link oficial, sem chamar o modelo (mensagem curta e só sobre o perfil). |
| 11.1 Comunicação de audiência | Nova audiência sincronizada do ProJuris | Rascunho para a revisora. Campo sem dado fica visível entre colchetes; a aprovação e a entrega são bloqueadas até a revisora completar ("corrigir"). Antes o rascunho cortava as linhas sem dado. |
| 12.1 Perícia agendada | Nova perícia sincronizada do ProJuris | Igual ao 11.1. |
| 04, 11.2, 12.2, 12.3 | Lembretes/confirmações de audiência e perícia | Aguardando aprovação: falta a antecedência configurada e a regra de quando pedir confirmação. Prontos para uso quando aprovados. |

Usos ficam marcados na mensagem enviada (`modeloOficial: { id, versao }`) e aparecem na tela como "usada N×".

## Política anti-redundância (01, 02, 08.2)

- No máximo um lembrete e uma confirmação por consulta.
- O lembrete não sai se a confirmação já saiu ou se a equipe já avisou o cliente hoje com o horário da consulta.
- A confirmação não sai se o cliente já confirmou presença, se o lembrete saiu há menos de 90 minutos (ex.: consulta às
  9h: lembrete às 8h, sem confirmação às 8h15) ou se a equipe mandou mensagem equivalente nas últimas 3 horas.
- Continuam valendo as regras anteriores: só com recibo da agenda, contato liberado, sem duplicar (reserva antes do envio),
  conversa com a equipe/pausada só gera aviso, e com a secretaria digital ligada o motor decide pelo modo.

## Versões

- Só advogada sênior ou admin aprova uma nova versão. A versão nova só pode usar os mesmos campos do modelo (nenhum campo
  novo); a anterior fica no histórico com autor, data e motivo. O texto da versão 1 está no código e nos snapshots de teste.
- A ativação (ativo, manual, aguardando aprovação) também é só de sênior/admin. Na consulta paga, só a versão escolhida pode
  ficar ativa; trocar a escolha desliga a outra.
- Tudo fica em `office_workspace.dados.bibliotecaMensagens` do dono, gravado só pelo servidor (o `saveOffice` do navegador
  preserva o valor do banco). A IA não tem acesso de escrita.

## Testes

- `src/test/biblioteca-mensagens-oficiais.test.ts` (57): metadados dos 19; fidelidade (desfazendo a troca dos campos volta
  exatamente ao texto oficial; mesmos emojis, mesma assinatura, mesmo número de linhas, nenhum campo pendente); snapshot
  dos 19 (`src/test/__snapshots__/`); amostras conferidas caractere a caractere; campo ausente ou inválido bloqueia;
  modelos manuais/aguardando nunca automáticos; versões e consulta paga; compatibilidade (manhã/tarde, hoje/amanhã, link
  do Meet, funil); Instagram/LinkedIn; fora do horário; `[nome]` só do cadastro; audiência/perícia com campos pendentes;
  política anti-redundância.
- Testes anteriores atualizados para os textos oficiais (confirmação, lembrete, reagendamento, audiência).
- Bateria da Anne: D40a com o texto 08.2; novos D51a/D51b (links oficiais, sem modelo) e D51c (confirmação da manhã 02).

## Decisões pendentes da advogada

1. **08.1 não tem o link do Meet.** Enquanto não houver uma variante oficial com link, consultas online continuam recebendo
   a confirmação aprovada anterior (com o link).
2. **06 diz "Fique tranquila"** (feminino). O sistema não adivinha gênero; uma variante neutra resolveria.
3. **01, 02 e 08.1 começam com "Bom dia"**: por isso só saem de manhã. À tarde, 08.2 substitui a confirmação; o lembrete e
   o 08.1 caem para aviso ou para a versão aprovada anterior.
4. **Consulta paga**: escolher 07.2 ou 07.3 e definir a elegibilidade.
5. **Audiência/perícia (04, 11.2, 12.2, 12.3)**: definir antecedência e quando pedir confirmação para ligar as rotinas.
