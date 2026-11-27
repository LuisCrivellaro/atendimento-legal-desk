// Só na demonstração: as rotas do servidor MCP fazem parte da árvore de rotas, mas nunca rodam no navegador.
const handler = () => async () => new Response('', { status: 404 });
export const auth: any = new Proxy(function () {}, { get: () => auth, apply: () => auth });
export const defineMcp = <T,>(x: T) => x;
export const defineTool = <T,>(x: T) => x;
export class ToolError extends Error {}
export const createTanStackMcpHandler = handler;
export const createTanStackOAuthProtectedResourceMetadataHandler = handler;
export type ToolContext = any;
export default {};
