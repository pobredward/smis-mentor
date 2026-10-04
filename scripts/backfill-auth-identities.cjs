/**
 * 소셜 신원 연결표(authIdentities) 채우기 — users.authProviders 에서 (구글 · 애플 · 네이버 · 카카오)
 *
 * 실행 (기본은 미리보기 — 아무것도 쓰지 않고 숫자만):
 *   NODE_PATH=node_modules node scripts/backfill-auth-identities.cjs <서비스계정키.json>
 *   NODE_PATH=node_modules node scripts/backfill-auth-identities.cjs <서비스계정키.json> --write
 *
 * - 활성 · temp · 탈퇴 계정 모두 (로그인 때 상태를 다시 본다). 제공자 id 가 없는 항목은 건너뛴다.
 * - 같은 신원이 두 사람에게 있으면 쓰지 않고 알린다 (활성 계정 우선 규칙은 로그인 때 서버가 판단).
 * - 이미 있는 연결표 항목은 그대로 둔다 (다른 사람이면 알림).
 * - 개인정보(이메일 · 이름)는 출력하지 않는다.
 * web lib/authIdentity.ts 의 identityKey · identityProviderOf 와 같은 규칙.
 */
const admin = require('firebase-admin');
const keyFile = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!keyFile) { console.error('서비스 계정 키 경로가 필요합니다.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(require('path').resolve(keyFile))) });

const PROVIDERS = ['google', 'apple', 'naver', 'kakao'];
const providerOf = (p) => { const n = typeof p === 'string' ? p.replace('.com', '').toLowerCase() : ''; return PROVIDERS.includes(n) ? n : null; };
const keyOf = (p, id) => `${p}_${String(id).replace(/\//g, '_')}`;

(async () => {
  const db = admin.firestore();
  const users = await db.collection('users').select('status', 'authProviders').get();
  const want = new Map(); // key -> [{uid, provider, providerUid, email, status}]
  let skippedNoUid = 0;
  users.forEach((d) => {
    const x = d.data();
    (Array.isArray(x.authProviders) ? x.authProviders : []).forEach((e) => {
      const p = providerOf(e && e.providerId);
      if (!p) return;
      if (!e.uid) { skippedNoUid += 1; return; }
      const k = keyOf(p, e.uid);
      want.set(k, [...(want.get(k) || []), { uid: d.id, provider: p, providerUid: String(e.uid), email: e.email || null, status: x.status || '' }]);
    });
  });
  const existing = new Map();
  (await db.collection('authIdentities').get()).forEach((d) => existing.set(d.id, d.data().uid));

  const counts = { 신원: want.size, 새로: 0, 이미있음: 0, 둘이상: 0, 다른사람이미: 0, 제공자id없음: skippedNoUid, 제공자별: {} };
  const writes = [];
  for (const [k, list] of want) {
    counts.제공자별[list[0].provider] = (counts.제공자별[list[0].provider] || 0) + 1;
    const uids = [...new Set(list.map((x) => x.uid))];
    if (uids.length > 1) { counts.둘이상 += 1; continue; }
    if (existing.has(k)) {
      if (existing.get(k) === uids[0]) counts.이미있음 += 1; else counts.다른사람이미 += 1;
      continue;
    }
    counts.새로 += 1;
    const x = list[0];
    writes.push([k, { uid: x.uid, provider: x.provider, providerUid: x.providerUid, ...(x.email ? { email: String(x.email).toLowerCase() } : {}), linkedAt: admin.firestore.Timestamp.now(), backfilled: true }]);
  }
  console.log(WRITE ? '쓰기 모드' : '미리보기 (쓰려면 --write)', JSON.stringify(counts));
  if (!WRITE) process.exit(0);
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach(([k, v]) => b.create(db.collection('authIdentities').doc(k), v));
    await b.commit();
  }
  console.log('완료:', writes.length, '개 썼습니다.');
  process.exit(0);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
