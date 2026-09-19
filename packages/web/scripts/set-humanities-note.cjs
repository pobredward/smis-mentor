/**
 * 정규·입소D+1 표의 '인문학 프로그램' 공통 줄에 안내 문구를 넣는다.
 *
 *   node scripts/set-humanities-note.cjs [--apply]
 *
 * 인문학은 직전 교시와 같은 강의실에서 이어서 하므로 그 사실을 줄에 적어 둔다.
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
const NOTE = '직전 강의실에서 진행';

(async () => {
  const snap = await db.collection('campTimetables').get();
  let updated = 0;
  for (const doc of snap.docs) {
    const t = doc.data();
    let touched = 0;
    const blocks = (t.blocks || []).map((b) => {
      if (b.kind !== 'shared' || !(b.label || '').includes('인문학') || b.subLabel === NOTE) return b;
      touched += 1;
      return { ...b, subLabel: NOTE };
    });
    if (!touched) continue;
    updated += 1;
    console.log(`${t.campCode} ${t.groupName} ${t.dayTypeLabel} — ${touched}줄`);
    if (apply) await doc.ref.update({ blocks, updatedAt: admin.firestore.Timestamp.now() });
  }
  console.log(`\n${apply ? '수정함' : '드라이런 — 바뀐 것 없음'}: ${updated}건`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
