# 고객 재무목표 설계 (자체 사이트)

claude.ai에 게시한 페이지를 Vercel에 올리는 사이트판입니다. 계산, 예시 고객, 관련 규제·법령, 추정 기준은 claude.ai판과 같습니다. AI 기능은 서버 함수(`api/ai.js`)가 Claude API(`claude-opus-5-5`)를 불러서 동작합니다.

## 폴더

| 경로 | 내용 |
|---|---|
| `public/index.html` | 메인 페이지(정보 수집 → 재무상태 분석·평가 → 대안 제시) |
| `public/regulations.html`, `public/regulations.json` | 관련 규제 및 법령 페이지와 자료 |
| `public/assumptions.json` | 추정 기준(물가, 수익률 등) |
| `api/ai.js` | AI 요청을 받아 Claude API로 넘기는 서버 함수. API 키는 여기서만 씁니다 |
| `build_site.py` | 원본(`..\goal-planner.html` 등)으로 `public/`을 다시 만드는 스크립트 |

## 페이지를 고친 뒤

claude.ai판 원본을 고쳤으면 아래를 실행해 `public/`을 다시 만든 다음 GitHub에 올립니다. Vercel이 자동으로 다시 배포합니다.

```
python build_site.py
```

## 처음 올리는 순서

1. GitHub에서 새 저장소를 만듭니다(비공개 권장).
2. 이 `site` 폴더를 그 저장소에 올립니다.
3. vercel.com에 GitHub 계정으로 가입하고 **Add New → Project**에서 그 저장소를 고릅니다. Framework Preset은 **Other**, 나머지는 그대로 둡니다.
4. **Settings → Environment Variables**에 `ANTHROPIC_API_KEY`를 넣습니다(값은 Anthropic Console에서 발급한 키). 넣은 뒤 **Deployments → Redeploy**를 한 번 누릅니다.
5. 주소(예: `https://프로젝트이름.vercel.app`)를 열어 오른쪽 위 상자에 "AI 연결됨"이 보이면 끝입니다.

## 관련 규제 및 법령: 조회·반영

규제 페이지의 [최신 내용 조회]와 [반영]은 비밀번호 없이 누구나 쓸 수 있습니다. 대신 같은 접속에서 조회는 1시간에 3번, 반영은 1시간에 5번까지만 됩니다.

- **조회** (`api/regs-refresh.js`, Claude Sonnet 5.5 + 웹 검색): 최신 발표를 찾아 지금 표와 달라진 점과 앞으로 바뀔 것을 보여 줍니다. 표는 바뀌지 않습니다. AI는 바꿀 항목만 정하고 서버가 그 항목만 고칩니다. 표에서 찾지 못한 지적은 '표에 넣지 못한 지적'으로 따로 보여 줍니다.
- **반영** (`api/regs-apply.js`): 확인한 결과를 GitHub의 `public/regulations.json`에 커밋합니다. Vercel이 1~2분 안에 다시 배포합니다. 바뀐 이력은 git 커밋과 표의 '변경 이력'에 남고, 잘못 반영되면 GitHub에서 그 커밋을 되돌리면 됩니다.

Vercel **Settings → Environment Variables**에 아래 두 가지를 넣고 Redeploy 해야 [반영]이 작동합니다. 조회는 기존 `ANTHROPIC_API_KEY`만 있으면 됩니다.

| 이름 | 값 |
|---|---|
| `GITHUB_TOKEN` | GitHub Fine-grained token. 저장소는 이 저장소만, 권한은 Contents: Read and write |
| `GITHUB_REPO` | `yongmin928/AFPK` |

반영은 GitHub를 직접 고치므로, PC에서 `build_site.py`를 실행하면 먼저 `git pull`로 최신 내용을 받습니다. 사이트 쪽 규제 표가 더 새로우면 원본 `regulations.json`으로 되돌려 복사합니다.

## 요금과 남용 방지

누구나 AI를 쓸 수 있는 공개 사이트입니다. 쓰는 만큼 Anthropic API 요금이 나갑니다.

- Anthropic Console의 **Limits**에서 월 사용 한도를 꼭 정해 두세요.
- 서버 함수에는 IP당 1분 20회, 한 번에 보내는 글 40만 자의 느슨한 제한만 있습니다.

## 안전 분류기 거절 대비

`api/ai.js`는 요청이 Claude의 안전 분류기에 거절되면 서버에서 다른 모델로 이어 받도록 `fallbacks: "default"`를 켜 두었습니다. 원하지 않으면 그 두 줄(`betas`, `fallbacks`)을 지우면 됩니다.

## claude.ai판과 다른 점

- 추정 기준과 상담 지침을 화면에서 고쳐 모든 사람에게 공통으로 저장하는 기능은 없습니다. 추정 기준은 `assumptions.json`을 고쳐 올리고, 상담 지침은 각자 브라우저에만 저장됩니다.
- 관련 규제 페이지의 [새로고침]은 지금처럼 관리자에게 요청하라는 안내만 보여 줍니다.
