/** Helpers de respuesta HTTP. */

const SIN_CACHE = {
  'Cache-Control': 'no-store',
} as const;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SIN_CACHE },
  });
}

export function texto(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SIN_CACHE },
  });
}
