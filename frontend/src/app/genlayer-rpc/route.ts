/**
 * Server-side JSON-RPC proxy for GenLayer studionet.
 *
 * The studionet RPC answers without `Access-Control-Allow-Origin`, so a browser
 * cannot call it cross-origin. Routing reads through this same-origin handler
 * fixes that for dev *and* production (the previous Vite proxy only existed in
 * the dev server).
 */
const UPSTREAM = "https://studio.genlayer.com/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Empty body" } },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
      cache: "no-store",
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Surface the real transport problem instead of an opaque 500.
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: `Guardian RPC proxy could not reach studionet: ${String(error)}`,
        },
      },
      { status: 502 },
    );
  }
}
