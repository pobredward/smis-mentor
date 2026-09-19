/**
 * 시간표 문서마다 흩어져 있던 반이름·강의실을 캠프 설정으로 모은다.
 *
 *   node scripts/hoist-class-info.cjs [--apply]
 *
 * 같은 캠프라도 표마다 값이 달라지는 문제가 있어서,
 * campSettings/{campCode}.classInfo 에 반코드별로 한 벌만 두고
 * 시간표 문서에서는 비운다. 화면은 그릴 때 설정값을 입힌다.
 * 표마다 값이 다르면 가장 많이 쓰인 값을 고르고, 나머지는 경고로 남긴다.
 */
const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();
const apply = process.argv.includes('--apply');

/** 가장 많이 쓰인 값 (동수면 먼저 나온 것) */
const pick = (values) => {
  const count = new Map();
  values.filter(Boolean).forEach((v) => count.set(v, (count.get(v) || 0) + 1));
  let best = null;
  let bestN = 0;
  for (const [v, n] of count) if (n > bestN) [best, bestN] = [v, n];
  return { best, distinct: [...count.keys()] };
};

(async () => {
  const snap = await db.collection('campTimetables').get();
  const byCamp = {};
  snap.forEach((d) => (byCamp[d.data().campCode] ??= []).push({ ref: d.ref, t: d.data() }));

  for (const [campCode, docs] of Object.entries(byCamp)) {
    const names = {};
    const rooms = {};
    docs.forEach(({ t }) =>
      (t.classes || []).forEach((c) => {
        if (!c.classCode) return;
        (names[c.classCode] ??= []).push(c.className);
        (rooms[c.classCode] ??= []).push(c.classroom);
      })
    );

    const classInfo = {};
    const warnings = [];
    for (const code of Object.keys(names).sort()) {
      const n = pick(names[code]);
      const r = pick(rooms[code]);
      if (n.best || r.best) {
        classInfo[code] = { ...(n.best ? { className: n.best } : {}), ...(r.best ? { classroom: r.best } : {}) };
      }
      if (n.distinct.length > 1) warnings.push(`${code} 반이름이 표마다 다름: ${n.distinct.join(' / ')}`);
      if (r.distinct.length > 1) warnings.push(`${code} 강의실이 표마다 다름: ${r.distinct.join(' / ')}`);
    }

    const toClear = docs.filter(({ t }) =>
      (t.classes || []).some((c) => c.className || c.classroom)
    );

    console.log(`\n■ ${campCode}`);
    console.log(
      '   캠프 설정으로:',
      Object.keys(classInfo).length
        ? Object.entries(classInfo)
            .map(([k, v]) => `${k}=${v.className || '-'}@${v.classroom || '-'}`)
            .join('  ')
        : '(없음)'
    );
    console.log(`   표에서 비울 문서: ${toClear.length}건`);
    warnings.forEach((w) => console.log('   ⚠', w));

    if (!apply) continue;
    if (Object.keys(classInfo).length) {
      await db
        .collection('campSettings')
        .doc(campCode)
        .set({ campCode, classInfo, updatedAt: new Date().toISOString() }, { merge: true });
    }
    for (const { ref, t } of toClear) {
      const classes = (t.classes || []).map(({ className, classroom, ...rest }) => rest);
      await ref.update({ classes, updatedAt: admin.firestore.Timestamp.now() });
    }
  }
  console.log(`\n${apply ? '적용함' : '드라이런 — 바뀐 것 없음'}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
