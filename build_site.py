# claude.ai용 원본(..\goal-planner.html 등)으로 자체 사이트용 public\ 폴더를 다시 만든다.
# 사용: python build_site.py   (원본을 고친 뒤 매번 실행)
import os, shutil, json, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)  # C:\Users\SAMSUNG\AFPK
PUB = os.path.join(HERE, "public")
os.makedirs(PUB, exist_ok=True)

# 0) 사이트의 [반영] 단추는 GitHub의 public/regulations.json을 직접 고친다.
#    그래서 만들기 전에 GitHub 내용을 먼저 받고, 사이트 쪽 표가 더 새로우면 원본으로 되돌려 복사한다.
r = subprocess.run(["git", "-C", HERE, "pull", "--ff-only", "-q"], capture_output=True, text=True)
if r.returncode != 0:
    sys.exit("GitHub에서 최신 내용을 받지 못했습니다. 먼저 해결하세요:\n" + (r.stderr or r.stdout))
site_regs, src_regs = os.path.join(PUB, "regulations.json"), os.path.join(SRC, "regulations.json")
if os.path.exists(site_regs):
    a, b = json.load(open(site_regs, encoding="utf-8")), json.load(open(src_regs, encoding="utf-8"))
    if a != b and (a["updated"], len(a["history"])) > (b["updated"], len(b["history"])):
        shutil.copyfile(site_regs, src_regs)
        print(f"사이트에서 반영한 규제 표({a['updated']})를 원본 regulations.json으로 가져왔습니다. claude.ai 게시본에도 다시 올려야 합니다.")

for f in ["assumptions.json", "regulations.json", "regulations.html"]:
    shutil.copyfile(os.path.join(SRC, f), os.path.join(PUB, f))

# 규제 페이지: 자체 사이트에서는 관리자 조회·반영 서버 함수에 연결
rh = os.path.join(PUB, "regulations.html")
t = open(rh, encoding="utf-8").read()
for a, b in [('const REFRESH_URL = "";', 'const REFRESH_URL = "api/regs-refresh";'), ('const APPLY_URL = "";', 'const APPLY_URL = "api/regs-apply";')]:
    assert t.count(a) == 1, ("regulations.html에서 바꿀 곳을 찾지 못함", a)
    t = t.replace(a, b)
open(rh, "w", encoding="utf-8").write(t)

s = open(os.path.join(SRC, "goal-planner.html"), encoding="utf-8").read()


def rep(a, b):
    global s
    assert s.count(a) == 1, ("원본에서 바꿀 곳을 찾지 못함", a[:70], s.count(a))
    s = s.replace(a, b)


# 1) claude.ai가 게시할 때 붙여 주던 문서 머리말
HEAD = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
if not s.lstrip().lower().startswith("<!doctype"):
    s = HEAD + s

# 2) AI: claude.ai 밖에서는 같은 주소의 /api/ai(서버 함수)로 Claude API를 부른다
rep('''let samplePromise = window.claude?.use ? window.claude.use("sample") : Promise.resolve(null);
let aiReady = null;
samplePromise.then((s) => {
  aiReady = s;
  if (s) { $("#aiAvail").textContent = "Claude 연결됨 · 첫 사용 시 허용 요청"; if (typeof renderGuideCount === "function") renderGuideCount(); return; }
  aiOff();
}).catch(aiOff);
// AI는 보는 사람의 claude.ai 계정으로 동작: 로그인하지 않았거나 claude.ai 밖에서 열면 꺼짐
function aiOff() {
  const msg = "AI 꺼짐 · claude.ai에 로그인한 상태로 이 페이지를 열어야 합니다";''',
r'''// 자체 사이트: 같은 주소의 /api/ai(서버 함수)가 Claude API를 부른다. 키는 서버에만 있다.
function serverAI() {
  const call = async (input, opts = {}, wantJson = false) => {
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input.map((m) => ({ role: m.role, content: String(m.content) }));
    let r;
    try {
      r = await fetch("api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, json: wantJson }), signal: opts.signal });
    } catch (e) { throw { code: opts.signal?.aborted ? "cancelled" : "network" }; }
    if (!r.ok) { let c = "server_error"; try { c = (await r.json()).error || c; } catch (e) {} throw { code: c }; }
    const rd = r.body.getReader(), dec = new TextDecoder();
    let text = "";
    try {
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        const i = text.indexOf("\u0000");
        if (i >= 0) { const c = text.slice(i).replace("\u0000ERR:", "").trim() || "server_error"; text = text.slice(0, i); throw { code: c, text }; }
        if (opts.onText) opts.onText({ text });
      }
    } catch (e) {
      if (e?.code) throw e;
      throw { code: opts.signal?.aborted ? "cancelled" : "network", text };
    }
    return { text };
  };
  const ask = (input, opts) => call(input, opts, false);
  ask.json = async (input, opts) => {
    const { text } = await call(input, opts, true);
    const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (e) {}
    const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw { code: "invalid_json" };
  };
  return ask;
}
const ON_CLAUDE = !!window.claude?.use;
let samplePromise = ON_CLAUDE ? window.claude.use("sample")
  : fetch("api/ai", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => (d?.ok ? serverAI() : null)).catch(() => null);
let aiReady = null;
samplePromise.then((s) => {
  aiReady = s;
  if (s) { $("#aiAvail").textContent = ON_CLAUDE ? "Claude 연결됨 · 첫 사용 시 허용 요청" : "AI 연결됨"; if (typeof renderGuideCount === "function") renderGuideCount(); return; }
  aiOff();
}).catch(aiOff);
// claude.ai에서는 보는 사람의 계정으로, 자체 사이트에서는 서버의 API 키로 동작
function aiOff() {
  const msg = ON_CLAUDE ? "AI 꺼짐 · claude.ai에 로그인한 상태로 이 페이지를 열어야 합니다" : "AI 꺼짐 · 서버에 AI 연결이 설정되지 않았습니다";''')
rep('''  if (c === "session_expired") return "다시 로그인해야 합니다.";''', '''  if (c === "session_expired") return "다시 로그인해야 합니다.";
  if (c === "server_key") return "서버의 AI 연결 설정을 확인해야 합니다. 페이지 관리자에게 알려 주세요.";
  if (c === "too_long") return "보낼 내용이 너무 깁니다. 상담 내용을 나눠서 넣어 보세요.";
  if (c === "refusal") return "AI가 이 요청에는 답하지 않았습니다. 표현을 바꿔 다시 시도하세요.";
  if (c === "network") return "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.";''')

rep('const base = aiReady ? "Claude 연결됨 · 첫 사용 시 허용 요청"', 'const base = aiReady ? (ON_CLAUDE ? "Claude 연결됨 · 첫 사용 시 허용 요청" : "AI 연결됨")')

# 3) claude.ai 저장소(db)가 없을 때의 안내
rep(': "값을 고치려면 claude.ai에 로그인한 상태에서 이 페이지를 여세요(페이지 소유자·편집자만 수정)."}',
    ': window.claude?.use ? "값을 고치려면 claude.ai에 로그인한 상태에서 이 페이지를 여세요(페이지 소유자·편집자만 수정)." : "이 기준은 사이트 관리자가 고칩니다."}')
rep(': "지금은 이 브라우저에만 저장됩니다(claude.ai에 로그인해 열면 공통 저장).";',
    ': window.claude?.use ? "지금은 이 브라우저에만 저장됩니다(claude.ai에 로그인해 열면 공통 저장)." : "이 브라우저에만 저장됩니다.";')

# 4) 앱(PWA): 홈 화면에 설치할 수 있게 manifest·아이콘·서비스 워커를 붙인다 (원본은 pwa\ 폴더)
PWA = os.path.join(HERE, "pwa")
PWA_HEAD = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<meta name="theme-color" content="#1c5a48">\n'
            '<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">\n'
            '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="재무목표 설계">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n')
i = s.lower().find("<meta charset")
j = s.find(">", i) + 1
s = s[:j] + "\n" + PWA_HEAD + s[j:].lstrip("\n")
rep("</body>", '<script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));</script>\n</body>')
for f in os.listdir(PWA):
    if f.endswith((".png", ".webmanifest")):
        shutil.copyfile(os.path.join(PWA, f), os.path.join(PUB, f))
# 안드로이드 앱(TWA)이 주소창 없이 열리도록 사이트 소유를 증명하는 파일
os.makedirs(os.path.join(PUB, ".well-known"), exist_ok=True)
shutil.copyfile(os.path.join(PWA, ".well-known", "assetlinks.json"), os.path.join(PUB, ".well-known", "assetlinks.json"))
import hashlib
build = hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]  # 페이지가 바뀌면 캐시 이름도 바뀜
sw = open(os.path.join(PWA, "sw.js"), encoding="utf-8").read().replace("__BUILD__", build)
open(os.path.join(PUB, "sw.js"), "w", encoding="utf-8", newline=chr(10)).write(sw)

open(os.path.join(PUB, "index.html"), "w", encoding="utf-8", newline=chr(10)).write(s)

# regulations.html: 머리말이 이미 있음. 돌아가기 링크는 ./ 그대로 index.html로 감
print("public/ 갱신 완료:", sorted(os.listdir(PUB)))
