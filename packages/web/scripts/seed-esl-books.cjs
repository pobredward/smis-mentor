/**
 * 학년별 ESL 교재 리스트를 appSettings/eslBooks 에 넣는다.
 *
 *   node scripts/seed-esl-books.cjs [--apply]
 *
 * 반에는 L-Code 만 붙이고 교재 3권은 여기서 조회하므로,
 * 교재가 바뀌면 이 리스트만 고치면 모든 반에 반영된다.
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

const bands = { A: '0-2학년', B: '3-4학년', C: '5-6학년', D: '중등부', E: '부모님' };

// [코드, Speaking, Reading, Writing]
const rows = [
  ['Aaaa', '', "Let' go 0", ''],
  ['Aaa', '', "Let' go 1", ''],
  ['Aaa(2)', '', "Let's go 0,1", ''],
  ['Aa', 'Kids 1', 'Sketch S 2', 'Beginner 1'],
  ['Ab', 'Kids 2', 'Sketch 2', 'Beginner 2'],
  ['Ac', 'Speak 1', 'Sense 1', 'Right 1'],

  ['Ba', 'Speak 1', 'Sense 1', 'Right 1'],
  ['Bb', 'Speak 2', 'Sense 2', 'Right 2'],
  ['Bc', 'Speak 3', 'Clue 2', 'Right 3'],
  ['Bd', 'Drive 2', 'Clue 3', 'Right 3'],
  ['Be', 'Drive 3', 'Source 3', 'Essay 1'],
  ['Bf', 'Drive 4', 'Best Way 2', 'Essay 2'],

  ['Ca', 'Speak 3', 'Clue 2', 'Right 3'],
  ['Cb', 'Speak 3', 'Clue 3', 'Essay 1'],
  ['Cc', 'Drive 3', 'Source 3', 'Essay 1'],
  ['Cd', 'Drive 3', 'Best Way 2', 'Essay 2'],
  ['Ce', 'Drive 4', 'Best Way 2', 'Essay 2'],
  ['Cf', 'Drive 4', 'Best Way 3', 'Essay 3'],

  ['Da', 'Drive 3', 'Best Way 2', 'Essay 2'],
  ['Db', 'Drive 4', 'Best Way 3', 'Essay 3'],
  ['Dc', 'Debate 1', 'Best Way 3', 'Essay 3'],
  ['Dd', 'Debate 2', 'Best Way 3', 'Essay 3'],

  ['Ea', 'Corner 2', '', ''],
  ['Eb', 'Corner 3', '', ''],
];

const codes = {};
rows.forEach(([code, speaking, reading, writing]) => {
  codes[code] = {
    ...(speaking ? { speaking } : {}),
    ...(reading ? { reading } : {}),
    ...(writing ? { writing } : {}),
  };
});

(async () => {
  console.log(`코드 ${rows.length}개`);
  let band = '';
  rows.forEach(([code, s, r, w]) => {
    const b = code[0];
    if (b !== band) {
      band = b;
      console.log(`\n■ ${bands[b]}`);
    }
    console.log(`   ${code.padEnd(7)} ${(s || '-').padEnd(10)} ${(r || '-').padEnd(12)} ${w || '-'}`);
  });

  // 저장된 반 코드가 리스트에 다 있는지
  const cs = await db.collection('campSettings').get();
  const missing = [];
  cs.forEach((d) => {
    const info = d.data().classInfo || {};
    Object.entries(info).forEach(([cls, v]) => {
      [v.bookCode, v.spareBookCode].filter(Boolean).forEach((c) => {
        if (!codes[c]) missing.push(`${d.id} ${cls} ${c}`);
      });
    });
  });
  console.log(`\n반에 붙어 있는 코드 중 리스트에 없는 것: ${missing.length}건`);
  missing.forEach((m) => console.log('   ⚠', m));

  if (apply) {
    await db
      .collection('appSettings')
      .doc('eslBooks')
      .set({ codes, bands, updatedAt: new Date().toISOString() }, { merge: true });
    console.log('\n저장함');
  } else {
    console.log('\n드라이런 — 바뀐 것 없음');
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
