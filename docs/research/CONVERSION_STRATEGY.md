# Estratégia comercial e de conversão: Manager ADV

27/11/2026. O Manager ADV não recebe visitantes: quem usa é a equipe. A "conversão" que importa aqui é a do escritório
(contato no WhatsApp → consulta → contrato → caso em produção), feita pela equipe e pela Anne. Esta estratégia diz
como a interface pode ajudar nisso, seguindo os princípios 46–50 (`../DESIGN_PRINCIPLES.md`) e as regras de ética e
publicidade da OAB que o próprio sistema já aplica (`src/lib/atendimento/ana-prompt.txt`: sem promessa de resultado,
sem captação insistente, sem comparação com outros escritórios, sem desconto anunciado). A referência normativa de
publicidade da advocacia (Código de Ética e Disciplina e o Provimento 205/2021 do Conselho Federal) deve ser
confirmada pela Dra.; não foi conferida nesta etapa.

Nenhuma regra de agenda, de envio, de aprovação ou texto oficial muda com esta estratégia.

## O funil do escritório (como o sistema já registra)

| Etapa | Onde aparece hoje | Quem age |
|---|---|---|
| 1. Contato novo no WhatsApp | Atendimento (lista única) | Anne (saudação oficial, 2 horários) e equipe |
| 2. Consulta agendada (online, gratuita, 30 min) | Conversa, Consulta e histórico, Google Agenda/ProJuris | Anne / equipe |
| 3. Consulta realizada ou ausência | Painel da secretaria digital (registro manual) | Equipe |
| 4. Trato feito | Botão "TRATO FEITO" | Equipe, após a consulta com a Dra. |
| 5. Contrato enviado e assinado | Aba Cliente (status do contrato), link do ProJuris | Equipe |
| 6. Documentos base e checklist | Aba Documentos, lembretes automáticos | Anne / equipe |
| 7. Produção | Produção (início manual) | Advogados |

## Onde a interface pode ajudar

### 46 · Conversão: transformar contatos em oportunidades reais

- Mostrar no Painel quantos casos estão em cada etapa do funil acima, com a lista ao clicar (o gráfico "Casos em
  andamento por etapa" já existe; falta torná-lo legível e clicável).
- Destacar no Atendimento quem recebeu horários e não escolheu, e quem teve consulta realizada sem "trato feito"
  registrado, como itens do centro de avisos (dados que o sistema já tem).
- Reduzir o tempo de resposta: "Próximo passo" como botão principal e mensagens prontas a um atalho.

### 47 · Objetivo claro em cada tela

Cada tela tem uma ação principal visível: Atendimento → responder/enviar horários; Produção → avançar a minuta;
Revisões → aprovar; Protocolo → registrar. As demais ficam em "Mais ações".

### 48 · Apresentar valor, não só preço

- O modelo oficial de orçamento (sempre rascunho para aprovação) já traz a referência da Tabela OAB/SP e as condições
  de pagamento. Quando a equipe abrir esse modelo, a interface pode mostrar ao lado um resumo do que o serviço inclui
  para aquele tipo de ação, **se a Dra. aprovar esse conteúdo**. O sistema não deve inventar descrições de serviço.
- Honorários continuam sendo explicados só pela Dra. na consulta (regra atual da Anne).

### 49 · Sem desconto sem contrapartida

- A única condição prevista é a do modelo aprovado (10% à vista no PIX; parcelamento no cartão; validade de 5 dias).
- A interface não oferece campo de "desconto livre"; qualquer condição diferente passa pela aprovação da Dra., como
  hoje.

### 50 · Follow-up útil e honesto

- Já existe: um lembrete ao lead que recebeu horários e não escolheu em 24h ("Atendente vendedor"), lembretes de
  contrato (24h) e de documentos faltantes (48h, até 3), sempre com recibo e respeitando pausas e a equipe.
- A interface deve deixar visível, na conversa, quais lembretes já saíram, quando, e quantos faltam, para a equipe não
  repetir a cobrança à mão.
- Pedido para parar ou "não tenho interesse" encerra o follow-up (regra atual); a interface mostra esse estado.

## O que não fazer

- Urgência falsa ("últimas vagas"), contagem regressiva para o cliente, cobrança repetida, promessa de resultado,
  comparação com outros escritórios, depoimentos ou números inventados.
- Métricas de conversão exibidas sem dado real por trás.
- Mudar a saudação oficial, os horários oferecidos ou a cadência dos lembretes sem pedido da Dra.

## Indicadores para acompanhar (quando autorizados)

Calculados a partir do que o sistema já grava, nunca estimados à mão:

- Contatos novos por semana → consultas agendadas → consultas realizadas → trato feito → contrato assinado.
- Tempo médio entre o primeiro contato e a consulta.
- Ausências e remarcações por semana.
- Leads com horários oferecidos e sem escolha após 24h.

## Fora do escopo

O site institucional `carolinasantos.com.br`, campanhas e redes sociais. Se um dia o escritório quiser trabalhar a
captação no site público, esta estratégia serve de base, mas é outro projeto.
