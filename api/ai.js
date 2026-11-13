// 페이지의 AI 기능(askAI / askAIJson)이 부르는 서버 함수.
// Claude API 키는 Vercel 환경변수 ANTHROPIC_API_KEY에만 두고, 브라우저에는 보내지 않는다.
//
// POST /api/ai  { messages: [{ role: "user" | "assistant", content: string }], json?: boolean }
//   → 답변 글을 조각조각 흘려보낸다(text/plain). 도중에 실패하면 "\u0000ERR:<코드>"를 붙이고 끝낸다.
// GET  /api/ai  → { ok: true } (키가 설정돼 있으면) / { ok: false }
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_CHARS = 400_000; // 한 번에 받는 입력 상한(대략 10만 토큰 남짓)
const PER_MINUTE = 20; // IP 하나가 1분에 보낼 수 있는 요청 수(인스턴스별, 느슨한 제한)

const client = new Anthropic(); // ANTHROPIC_API_KEY를 환경변수에서 읽음
const hits = new Map();

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_MINUTE;
}

function errCode(e) {
  const s = e?.status;
  if (s === 429 || s === 529) return "rate_limited";
  if (s === 401 || s === 403) return "server_key";
  if (e?.name === "APIUserAbortError") return "cancelled";
  if (e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError") return "network";
  return "server_error";
}

export async function GET() {
  return json({ ok: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "server_key" }, 503);
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (tooMany(ip)) return json({ error: "rate_limited" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  const ok = messages && messages.length > 0 && messages.length <= 60 &&
    messages.every((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.length > 0) &&
    messages[0].role === "user" && messages[messages.length - 1].role === "user";
  if (!ok) return json({ error: "bad_request" }, 400);
  if (messages.reduce((s, m) => s + m.content.length, 0) > MAX_CHARS) return json({ error: "too_long" }, 413);

  const wantJson = !!body.json;
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    // 안전 분류기가 거절하면 서버에서 다른 모델로 이어 받게 함
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    ...(wantJson ? { system: "Reply with exactly one JSON value and nothing else: no prose before or after it and no code fences." } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
        }
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") ctrl.enqueue(enc.encode("\u0000ERR:refusal"));
        else if (msg.stop_reason === "max_tokens") ctrl.enqueue(enc.encode("\u0000ERR:too_long_answer"));
      } catch (e) {
        console.error("ai error", e?.status, e?.message);
        ctrl.enqueue(enc.encode("\u0000ERR:" + errCode(e)));
      }
      ctrl.close();
    },
    cancel() { stream.abort(); },
  });
  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
