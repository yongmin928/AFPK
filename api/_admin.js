// 규제 조회·반영 서버 함수가 함께 쓰는 도구. 파일 이름이 _로 시작해 주소로는 열리지 않는다.
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// 누구나 쓸 수 있으므로 같은 접속(IP)에서 너무 자주 누르지 못하게 막는다(인스턴스별, 느슨한 제한).
const hits = new Map();
const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

// 통과하면 null, 막히면 돌려줄 Response. name별로 windowMs 동안 max번까지.
export function limit(request, name, max, windowMs) {
  const k = name + "|" + ipOf(request), now = Date.now();
  const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return json({ error: "too_often", minutes: Math.ceil((windowMs - (now - list[0])) / 60_000) }, 429);
  list.push(now); hits.set(k, list);
  if (hits.size > 5000) hits.clear();
  return null;
}

export const KEY = { regions: "name", rules: "topic", deductions: "item", laws: "item" };
export const STATUSES = ["시행 예정", "높은 가능성", "보도·검토(미확정)"];

// regulations.json 모양 검사: 반영 전에 꼭 통과해야 함
export function validRegs(d) {
  if (!d || typeof d !== "object") return "형식이 아닙니다";
  for (const k of ["updated", "basis", "method"]) if (typeof d[k] !== "string") return `${k} 없음`;
  for (const k of ["regions", "rules", "history", "sources", "deductions", "laws", "outlook"]) if (!Array.isArray(d[k])) return `${k} 목록 없음`;
  for (const [sec, key] of Object.entries(KEY)) if (d[sec].some((x) => !x || typeof x[key] !== "string" || !x[key].trim())) return `${sec}의 ${key} 빈칸`;
  if (d.regions.some((r) => !Array.isArray(r.match) || !r.match.length)) return "regions의 match 빈칸";
  if (d.outlook.some((o) => !STATUSES.includes(o.status) || !o.topic || !o.what)) return "outlook 상태·내용 오류";
  if (d.history.some((h) => !h.date || !h.what)) return "history 오류";
  if (JSON.stringify(d).length > 400_000) return "너무 큼";
  return null;
}
