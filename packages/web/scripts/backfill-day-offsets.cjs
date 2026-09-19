/**
 * 날짜 표(인문학 등)를 코드의 기본 틀과 맞춘다.
 *
 *   node scripts/backfill-day-offsets.cjs [--apply]
 *
 * 1) dayOffsets(캠프 N일차) 채우기
 *    저장된 dateLabel("1/6, 1/7")을 그 표가 만들어진 기준 캠프의 시작일과 대조해 일차로 환산한다.
 *    일차가 들어가면 화면은 각 캠프의 시작일에서 날짜를 다시 계산하므로,
 *    여름 캠프에 겨울 날짜가 박혀 있는 문제가 사라지고 다음 기수도 자동으로 맞는다.
 *
 * 2) 교무실조 열 맞추기
 *    인문학 시간에는 교무실조 담당이 따로 없다. 열은 두되 '-' 만 넣어
 *    정규 표와 열 구성을 맞춘다.
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

/** 저장된 날짜 표는 J29 관리시트에서 뽑은 것이다 — 그 캠프의 입소일이 1일차 */
const SOURCE_CAMP = 'J29';

(async () => {
  const camps = {};
  (await db.collection('jobCodes').get()).forEach((d) => {
    const j = d.data();
    if (j.code && j.startDate?.toDate) camps[j.code] = j.startDate.toDate();
  });
  const sourceStart = camps[SOURCE_CAMP];
  if (!sourceStart) throw new Error(`${SOURCE_CAMP} 시작일을 찾을 수 없습니다.`);
  const year = sourceStart.getFullYear();
  console.log(`기준: ${SOURCE_CAMP} ${sourceStart.toISOString().slice(0, 10)} = 1일차\n`);

  const toOffsets = (label) => {
    const out = [];
    for (const tok of String(label).split(',')) {
      const m = tok.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
      if (!m) return null;
      // 1월 캠프가 해를 넘길 수 있으니, 시작일보다 앞서면 다음 해로 본다
      let d = new Date(year, Number(m[1]) - 1, Number(m[2]));
      if (d < sourceStart) d = new Date(year + 1, Number(m[1]) - 1, Number(m[2]));
      out.push(Math.round((d - sourceStart) / 86400000) + 1);
    }
    return out.length ? out : null;
  };

  const snap = await db.collection('campTimetables').where('layout', '==', 'date').get();
  console.log(`날짜 표 ${snap.size}건\n`);
  let updated = 0;
  for (const doc of snap.docs) {
    const t = doc.data();
    const start = camps[t.campCode];
    let touched = 0;
    // 교무실조 열 — 인문학 시간에는 담당이 따로 없어 '-' 만 넣는다
    const DUTY = { key: 'duty', label: '교무실조', staticText: '-' };
    let extraColumns = [...(t.extraColumns || [])];
    const existing = extraColumns.find((e) => e.key === 'duty');
    let columnNote = '';
    if (!existing) {
      extraColumns.push(DUTY);
      columnNote = '교무실조 열 추가(-)';
    } else if (existing.staticText !== '-' || existing.staffRole) {
      extraColumns = extraColumns.map((e) => (e.key === 'duty' ? DUTY : e));
      columnNote = '교무실조 담당 → "-"';
    }
    const blocks = (t.blocks || []).map((b) => {
      if (!b.dateLabel || b.dayOffsets?.length) return b;
      const off = toOffsets(b.dateLabel);
      if (!off) return b;
      touched += 1;
      return { ...b, dayOffsets: off };
    });
    if (!touched && !columnNote) continue;
    updated += 1;
    const preview = blocks
      .filter((b) => b.dayOffsets)
      .map((b) => {
        if (!start) return `${b.dateLabel}→[${b.dayOffsets}]`;
        const shown = b.dayOffsets
          .map((n) => {
            const d = new Date(start);
            d.setDate(d.getDate() + (n - 1));
            return `${d.getMonth() + 1}/${d.getDate()}`;
          })
          .join(', ');
        return `${b.dateLabel} → ${shown}`;
      });
    console.log(
      `${t.campCode} ${t.groupName} ${t.dayTypeLabel}` +
        (touched ? ` — 날짜 ${touched}줄` : '') +
        (columnNote ? ` — ${columnNote}` : '')
    );
    preview.forEach((x) => console.log('   ', x));
    if (apply)
      await doc.ref.update({ blocks, extraColumns, updatedAt: admin.firestore.Timestamp.now() });
  }
  console.log(`\n${apply ? '수정함' : '드라이런 — 바뀐 것 없음'}: ${updated}건`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
