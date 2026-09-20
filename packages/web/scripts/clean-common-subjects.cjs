/**
 * 과목·주제를 공통에서 되돌린다.
 *
 *   node scripts/clean-common-subjects.cjs [--apply]
 *
 * 과목·주제는 Day 마다 다른 값이라 공통에서 빼기로 했다. 앞서 올려 둔
 * campSettings/{camp}.timetableCommon[group].subjects 와, 그때 켠 표의
 * own.subjects 플래그는 이제 아무도 읽지 않으므로 지운다.
 * 표 자신의 subjects 는 건드리지 않는다 — 그게 이제 유일한 출처다.
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

(async () => {
  const [settings, tables] = await Promise.all([
    db.collection('campSettings').get(),
    db.collection('campTimetables').get(),
  ]);

  const settingEdits = [];
  settings.forEach((d) => {
    const common = d.data().timetableCommon;
    if (!common) return;
    const groups = Object.entries(common).filter(([, v]) => v && v.subjects !== undefined);
    if (groups.length) settingEdits.push({ ref: d.ref, id: d.id, common, groups: groups.map(([g]) => g) });
  });

  const tableEdits = [];
  tables.forEach((d) => {
    const t = d.data();
    if (t.own?.subjects === undefined) return;
    // 표 자신의 subjects 가 비어 있는데 own 만 켜져 있으면 알려 준다 (드문 경우)
    const bare = !(t.subjects || []).length;
    tableEdits.push({ ref: d.ref, why: `${t.campCode} ${t.groupName} · ${t.dayTypeLabel || t.dayType}`, bare });
  });

  console.log(`campSettings 에서 공통 subjects 제거 : ${settingEdits.length}개 캠프`);
  settingEdits.forEach((e) => console.log(`   ${e.id} — ${e.groups.join(', ')}`));
  console.log(`\n표에서 own.subjects 플래그 제거      : ${tableEdits.length}개`);
  tableEdits.forEach((e) => console.log(`   ${e.why}${e.bare ? '   ← 이 표의 과목이 비어 있음(확인 필요)' : ''}`));

  if (!apply) {
    console.log('\n(미리보기입니다. 실제로 쓰려면 --apply)');
    return;
  }

  for (const e of settingEdits) {
    // merge:true 는 중첩 맵을 합치기만 해서 키가 안 지워진다.
    // 그래서 지울 필드 경로를 하나씩 짚어 준다 (그룹 이름에 점이 있어도 안전하게 FieldPath 로).
    const updates = [];
    e.groups.forEach((g) => {
      updates.push(new admin.firestore.FieldPath('timetableCommon', g, 'subjects'));
      updates.push(admin.firestore.FieldValue.delete());
    });
    await e.ref.update(...updates, 'updatedAt', new Date().toISOString());
    console.log(`campSettings/${e.id} 정리 — ${e.groups.join(', ')}`);
  }
  for (const e of tableEdits) {
    await e.ref.update({ own: admin.firestore.FieldValue.delete() });
    console.log(`own 제거 ← ${e.why}`);
  }
  console.log('\n완료.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
