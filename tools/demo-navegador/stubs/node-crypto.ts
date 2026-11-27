// Só na demonstração: os webhooks (/api/public/*) fazem parte da árvore de rotas, mas nunca rodam no navegador.
export const timingSafeEqual = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
export default { timingSafeEqual };
