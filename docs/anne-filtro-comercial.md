# Filtro de comunicação comercial da Anne (26/11/2026)

Antes de qualquer resposta automática, a Anne separa propaganda e prospecção de quem procura atendimento jurídico.
Regra em `src/lib/atendimento/filtro-comercial.ts`, usada igual em produção (`processarAna`) e no simulador
(`tools/simulador-ana/engine.ts`). Não chama o modelo de IA.

## Onde entra

Depois da regra de mensagens curtas ("ok", "obrigado") e antes da chamada ao modelo, da saudação inicial, da oferta de
horários e de qualquer automação. O funil internacional e o pedido de processo pendente, que têm gatilhos próprios,
continuam antes.

## Como decide

Pesa sinais de intenção, não palavras soltas:

| Sinais comerciais (somam pontos) | Sinais de quem procura atendimento (protegem) |
|---|---|
| Lista de transmissão ou descadastro ("responda SAIR", "para não receber") | Problema próprio ("fui cobrado", "fui demitido", "continuam me cobrando") |
| Robô de atendimento de outra empresa ("sou a assistente virtual", "digite o número da opção") | Cobrança, juros ou multa contestados ("indevida", "abusiva") |
| Promoção ou oferta ("aproveite", "cupom", "50% off", "só hoje") | O próprio caso ("meu plano", "meu contrato", "minha rescisão") |
| Curso, evento ou material com inscrição | Descumprimento ou negativa ("não devolveram", "negou a cirurgia") |
| Venda de plano ou assinatura ("planos a partir de", "teste grátis") | Pedido de atendimento ("quero uma consulta", "preciso de orientação") |
| Prospecção para o escritório ("marketing jurídico", "seu escritório", "gostaria de apresentar") | Pergunta ao escritório ("vocês atendem?", "a doutora atende?") |
| Link de divulgação (só reforça) | "Recebi uma oferta/cobrança/notificação", "é golpe?", "tenho direito?" |

Resultado:
- **comercial** (pontuação alta, sem sinal de cliente, contato desconhecido): nenhuma resposta, nem saudação; nada de
  atendimento, agenda ou follow-up; a mensagem fica no histórico com a marca "Comunicação comercial: ignorada pela Anne"
  e sai da fila "aguarda resposta" da equipe.
- **duvida**: também sem resposta; aviso interno "Mensagem que parece comercial… conferir se é cliente" (tipo
  `triagem`), a mensagem continua na fila da equipe.
- **atender**: fluxo normal.

Proteções: qualquer sinal de cliente faz atender (só uma mensagem muito comercial com esse traço vira dúvida); só o
assunto jurídico em material comercial (ex.: curso sobre aposentadoria) vira dúvida, nunca descarte; contato já conhecido
(conversa anterior com o escritório, consulta, contrato, cadastro, vínculo, etapa adiantada) nunca é ignorado sozinho —
no máximo vira dúvida. Cada mensagem é avaliada: se a mesma pessoa manda propaganda e depois um pedido real, o pedido é
atendido.

## Testes

- `src/test/filtro-comercial.test.ts`: propaganda, cursos, assinaturas, prospecção e robôs ignorados; clientes falando de
  plano de saúde, oferta de acordo, curso que não cancela, assinatura cobrada, promoção não cumprida e multa atendidos;
  dúvida; contato conhecido; marcação no histórico e fila da equipe.
- Bateria da Anne (`tools/simulador-ana/bateria/cenarios.ts`, D50a–D50i): sem resposta e sem chamar o modelo para
  comercial; aviso de triagem na dúvida; clientes sobre ofertas/planos/cobranças atendidos; propaganda seguida de pedido
  real do mesmo número.

## Limitações

- Regra de sinais em português; mensagens comerciais muito diferentes dos padrões podem passar como "atender" (a Anne
  responde como hoje) e mensagens de cliente muito parecidas com propaganda podem virar "dúvida" (a equipe confere).
- Mensagens só com imagem ou áudio não têm texto para classificar e seguem as regras atuais.
