// Cloudflare Pages Functions entry. Shares its logic with the Worker in src/api.js.
import { handleApi } from "../../src/api.js";

export async function onRequest(context) {
  const res = await handleApi(context.request, context.env);
  return res || new Response(JSON.stringify({ ok: false, error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
