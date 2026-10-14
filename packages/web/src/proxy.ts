/**
 * smis-mentor.com 운영 종료 (2026-10-15) — 어떤 주소로 들어와도 SMIS CAMP 안내만 보여 준다.
 *
 *  - 화면 · 마크다운 미러(.md) · llms.txt · sitemap · robots · MCP · API 전부 막는다.
 *    통과시키는 것은 Next 빌드 파일(_next/static · _next/image)과 아이콘뿐.
 *  - API(/api/*) 는 410 JSON. 나머지는 안내 화면 (옛 앱 웹뷰에서도 보이게 200 + noindex).
 *  - 데이터는 SMIS CAMP(Firebase smiscamp-bacba)로 옮겼다. 새 서비스: https://smiscamp.com (저장소 pobredward/smiscamp)
 *
 * 예전 proxy(AI 에이전트 마크다운 협상 · 점검 모드)는 git 기록에 있다.
 */
import { NextRequest, NextResponse } from 'next/server';

const NEW_URL = 'https://smiscamp.com';
const API_MESSAGE =
  'SMIS Mentor 서비스가 종료되었습니다. https://smiscamp.com 을 이용해 주세요. / SMIS Mentor has closed. Please use https://smiscamp.com.';

const CLOSED_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light dark">
<title>SMIS CAMP로 옮겼습니다</title>
<link rel="icon" href="/favicon.ico">
<style>
:root{--brand:#2E26D3;--brand-soft:#EEEDFF;--bg:#F5F6FB;--card:#FFFFFF;--text:#14142B;--sub:#555872;--line:#E6E7F0}
@media (prefers-color-scheme:dark){:root{--brand:#7C75FF;--brand-soft:#232046;--bg:#0E0E16;--card:#17172A;--text:#F2F2F8;--sub:#A6A8C0;--line:#2A2A40}}
*{box-sizing:border-box}
html,body{margin:0}
body{min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;-webkit-font-smoothing:antialiased;word-break:keep-all;line-height:1.6;display:flex;justify-content:center;padding:40px 16px calc(40px + env(safe-area-inset-bottom))}
main{width:100%;max-width:520px}
.mark{font-weight:900;letter-spacing:.04em;color:var(--brand);font-size:15px;margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 24px}
.badge{display:inline-block;font-size:12px;font-weight:700;color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:4px 10px;margin-bottom:14px}
h1{font-size:23px;line-height:1.35;letter-spacing:-.02em;margin:0 0 12px}
p{margin:0 0 10px;font-size:15px;color:var(--sub)}
p strong{color:var(--text)}
.btn{display:block;text-align:center;margin:22px 0 4px;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;font-size:16px;border-radius:14px;padding:15px 16px}
.btn.ghost{background:transparent;color:var(--brand);border:1.5px solid var(--brand);margin-top:12px;padding:13.5px 16px}
.app .btn.ghost{margin-top:16px}
.app{margin-top:22px;padding-top:20px;border-top:1px solid var(--line)}
h2{font-size:16px;margin:0 0 8px;color:var(--text)}
ul{margin:0;padding-left:18px}
li{font-size:14.5px;color:var(--sub);margin-bottom:6px}
li strong{color:var(--text)}
.en{margin-top:16px}
.en h1{font-size:19px}
.en p,.en li{font-size:14px}
.foot{font-size:12.5px;color:var(--sub);text-align:center;margin-top:20px}
.foot a{color:inherit}
</style>
</head>
<body>
<main>
<p class="mark">SMIS CAMP</p>

<section class="card" lang="ko">
<span class="badge">서비스 종료 안내</span>
<h1>SMIS Mentor는<br>SMIS CAMP로 옮겼습니다</h1>
<p>smis-mentor.com은 2026년 10월 15일부로 운영을 마쳤습니다. 앞으로는 <strong>smiscamp.com</strong>에서 이용해 주세요.</p>
<p>지원서, 캠프 기록, 수업자료, 채팅 등 지금까지의 정보는 모두 옮겨 두었습니다. 쓰시던 계정 그대로 로그인하시면 됩니다.</p>
<a class="btn" href="https://smiscamp.com">smiscamp.com으로 이동</a>
<div class="app">
<h2>📱 앱 안내</h2>
<ul>
<li><strong>아이폰</strong>은 지금 App Store에서 새 <strong>SMIS CAMP 앱</strong>을 내려받으실 수 있습니다.</li>
<li><strong>안드로이드</strong>는 Google Play 출시를 준비하고 있습니다. 출시되면 ‘SMIS CAMP’를 검색해 바로 내려받으실 수 있고, 그전까지는 smiscamp.com(웹)에서 이용해 주세요.</li>
<li><strong>기존 SMIS Mentor 앱은 이제 사용하지 말아 주세요.</strong> 기존 앱에서 입력한 내용은 새 서비스에 반영되지 않습니다.</li>
</ul>
<a class="btn ghost" href="https://apps.apple.com/kr/app/smis-camp/id6819282081">App Store에서 SMIS CAMP 받기</a>
</div>
</section>

<section class="card en" lang="en">
<h1>SMIS Mentor has moved to SMIS CAMP</h1>
<p>smis-mentor.com closed on October 15, 2026. Please use <strong>smiscamp.com</strong> from now on. Your applications, camp records, lesson materials and chats have all been moved — just sign in with the same account.</p>
<ul>
<li><strong>iPhone:</strong> the new <strong>SMIS CAMP app</strong> is available on the App Store now.</li>
<li><strong>Android:</strong> coming soon to Google Play — search “SMIS CAMP” once it’s released. Until then, please use smiscamp.com in your browser.</li>
<li><strong>Please stop using the old SMIS Mentor app.</strong> Anything entered there will not carry over.</li>
</ul>
<a class="btn" href="https://smiscamp.com">Go to smiscamp.com</a>
<a class="btn ghost" href="https://apps.apple.com/kr/app/smis-camp/id6819282081">Get SMIS CAMP on the App Store</a>
</section>

<p class="foot">(주)에스엠아이에스 · <a href="https://smiscamp.com">smiscamp.com</a></p>
</main>
</body>
</html>`;

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: API_MESSAGE, closed: true, movedTo: NEW_URL },
      { status: 410, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    );
  }
  return new NextResponse(CLOSED_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const config = {
  // 모든 주소 — Next 빌드 파일과 아이콘만 빼고
  matcher: ['/((?!_next/static|_next/image|favicon|apple-icon|android-icon|ms-icon).*)'],
};
