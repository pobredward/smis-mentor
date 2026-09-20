/**
 * 칸 설명의 줄을 새 모양으로 옮긴다.
 *
 *   node scripts/migrate-guide-items.cjs [--apply]
 *
 * 처음에는 줄이 그냥 문자열이었고 링크는 따로 모아 뒀다(guide.links).
 * 이제는 줄마다 글·링크·사진·동영상을 섞을 수 있어서,
 *   items: ["첫 줄"]            → items: [{id, type:'text', text:'첫 줄'}]
 *   links: [{label,url}]        → "자료" 섹션의 type:'link' 줄
 * 로 바꾼다. 읽는 쪽에도 같은 변환이 있어서 안 돌려도 깨지지는 않지만,
 * 저장된 값도 맞춰 두면 다음부터 변환 없이 바로 읽는다.
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

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq += 1).toString(36)}`;

function migrate(guide) {
  let touched = false;
  const sections = (guide.sections || []).map((s) => ({
    id: s.id || newId(),
    title: s.title || '',
    items: (s.items || []).map((it) => {
      if (typeof it === 'string') {
        touched = true;
        return { id: newId(), type: 'text', ...(it.trim() ? { text: it.trim() } : {}) };
      }
      return it;
    }),
  }));

  if (Array.isArray(guide.links) && guide.links.length) {
    touched = true;
    const items = guide.links
      .filter((l) => l && l.url)
      .map((l) => ({
        id: l.id || newId(),
        type: 'link',
        ...(l.label ? { text: l.label } : {}),
        url: l.url,
      }));
    if (items.length) sections.push({ id: newId(), title: '자료', items });
  } else if (guide.links !== undefined) {
    touched = true; // 빈 links 필드도 치운다
  }

  // 내용이 하나도 없는 줄·섹션은 이참에 정리
  const cleaned = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => (i.type === 'text' ? (i.text || '').trim() : (i.url || '').trim())),
    }))
    .filter((s) => s.title || s.items.length);

  const out = {
    ...(guide.summary ? { summary: guide.summary } : {}),
    ...(cleaned.length ? { sections: cleaned } : {}),
    ...(guide.updatedAt ? { updatedAt: guide.updatedAt } : {}),
    ...(guide.updatedBy ? { updatedBy: guide.updatedBy } : {}),
  };
  return { out, touched };
}

(async () => {
  const snap = await db.collection('campSettings').get();
  const edits = [];

  snap.forEach((d) => {
    const guides = d.data().timetableGuides;
    if (!guides || !Object.keys(guides).length) return;
    const next = {};
    let any = false;
    Object.entries(guides).forEach(([key, guide]) => {
      const { out, touched } = migrate(guide || {});
      next[key] = out;
      if (touched) any = true;
    });
    if (any) edits.push({ ref: d.ref, id: d.id, next, keys: Object.keys(guides) });
  });

  if (!edits.length) {
    console.log('옮길 값이 없습니다 — 이미 새 모양입니다.');
    return;
  }

  edits.forEach((e) => {
    console.log(`[${e.id}] ${e.keys.length}개 칸`);
    Object.entries(e.next).forEach(([k, g]) => {
      const n = (g.sections || []).reduce((a, s) => a + s.items.length, 0);
      const kinds = [...new Set((g.sections || []).flatMap((s) => s.items.map((i) => i.type)))];
      console.log(`   ${k}: 섹션 ${(g.sections || []).length}개 · 줄 ${n}개 (${kinds.join(', ') || '없음'})`);
    });
  });

  if (!apply) {
    console.log('\n(미리보기입니다. 실제로 쓰려면 --apply)');
    return;
  }
  for (const e of edits) {
    await e.ref.update({ timetableGuides: e.next });
    console.log(`campSettings/${e.id} 정리`);
  }
  console.log('\n완료.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
