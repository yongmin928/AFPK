// 조회 결과(next)를 GitHub의 public/regulations.json에 커밋한다. 누구나 쓸 수 있고, 접속당 1시간에 5번까지.
// 커밋되면 Vercel이 자동으로 다시 배포해 1~2분 뒤 사이트에 반영된다. 바뀐 이력은 git에 남는다.
// POST { next }  → { ok: true, commit }
// 필요한 환경변수: GITHUB_TOKEN(이 저장소 Contents 읽기·쓰기), GITHUB_REPO(예: yongmin928/AFPK)
// 잘못 반영되면 GitHub에서 그 커밋을 되돌리면 된다(git revert).
import { json, limit, validRegs } from "./_admin.js";

const PATH = "public/regulations.json";
const BRANCH = "main";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO;
  if (!token || !repo) return json({ error: "not_configured", detail: "GITHUB_TOKEN/GITHUB_REPO" }, 503);
  const next = body?.next;
  const bad = validRegs(next);
  if (bad) return json({ error: "bad_next", detail: bad }, 400);
  const deny = limit(request, "apply", 5, 60 * 60_000);
  if (deny) return deny;

  const api = `https://api.github.com/repos/${repo}/contents/${PATH}`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "goal-planner-site" };
  try {
    const cur = await fetch(`${api}?ref=${BRANCH}`, { headers });
    if (!cur.ok) return json({ error: "github", detail: `read ${cur.status}` }, 502);
    const { sha } = await cur.json();
    const last = next.history[next.history.length - 1];
    const put = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message: `관련 규제 및 법령 갱신 (${next.updated}): ${last?.what || ""}`.slice(0, 200),
        content: Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8").toString("base64"),
        sha,
        branch: BRANCH,
      }),
    });
    if (!put.ok) return json({ error: "github", detail: `write ${put.status}` }, 502);
    const out = await put.json();
    return json({ ok: true, commit: out?.commit?.sha?.slice(0, 7) || "" });
  } catch (e) {
    console.error("regs-apply", e?.message);
    return json({ error: "github", detail: "network" }, 502);
  }
}
