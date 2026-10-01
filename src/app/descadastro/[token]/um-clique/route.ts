import { unsubscribe } from "../actions";

// Descadastro em um clique (cabeçalho List-Unsubscribe-Post do Gmail/Apple Mail).
export async function POST(_request: Request, { params }: RouteContext<"/descadastro/[token]/um-clique">) {
  const { token } = await params;
  await unsubscribe(token);
  return new Response(null, { status: 200 });
}

export async function GET(request: Request) {
  return Response.redirect(new URL("..", request.url.endsWith("/") ? request.url : `${request.url}/`), 303);
}
