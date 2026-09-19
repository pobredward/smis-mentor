/**
 * 저장된 시간표의 전담 열을 코드 기본 틀과 맞춘다.
 *
 *   node scripts/fix-duty-columns.cjs [--apply]
 *
 * 1) 전담 열 라벨을 '교무실(사진)조' 로 통일
 * 2) 입소 D+1 은 전담 열을 쓰지 않으므로 제거
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
const NEW_LABEL = '교무실(사진)조';

(async () => {
  const snap = await db.collection('campTimetables').get();
  let updated = 0;
  for (const doc of snap.docs) {
    const t = doc.data();
    const cols = t.extraColumns || [];
    let next = cols;
    let note = '';

    if (t.dayType === 'arrival_d1' && cols.length) {
      next = [];
      note = `전담 열 제거 (${cols.map((e) => e.label).join(', ')})`;
    } else {
      const renamed = cols.map((e) =>
        e.label && e.label !== NEW_LABEL && e.label.includes('교무실') ? { ...e, label: NEW_LABEL } : e
      );
      if (JSON.stringify(renamed) !== JSON.stringify(cols)) {
        next = renamed;
        note = `라벨 → ${NEW_LABEL}`;
      }
    }
    if (!note) continue;
    updated += 1;
    console.log(`${t.campCode} ${t.groupName} ${t.dayTypeLabel} — ${note}`);
    if (apply) await doc.ref.update({ extraColumns: next, updatedAt: admin.firestore.Timestamp.now() });
  }
  console.log(`\n${apply ? '수정함' : '드라이런 — 바뀐 것 없음'}: ${updated}건`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
