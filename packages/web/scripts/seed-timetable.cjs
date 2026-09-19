/**
 * 시간표 시드 — 관리시트에서 뽑은 JSON 을 campTimetables 로 넣는다.
 *
 *   node scripts/seed-timetable.cjs scripts/seed/j29-timetable.json [--apply] [--replace]
 *
 * --apply   없으면 드라이런(출력만)
 * --replace 같은 캠프의 기존 시간표를 먼저 모두 지우고 새로 넣는다
 *
 * 사람 이름은 넣지 않는다. 담임은 반번호로, 원어민은 그룹+역할로 앱에서 조인된다.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const admin = require('firebase-admin');
const { randomUUID } = require('crypto');

const file = process.argv[2];
const apply = process.argv.includes('--apply');
const replace = process.argv.includes('--replace');
if (!file) {
  console.error('사용법: node scripts/seed-timetable.cjs <seed.json> [--apply] [--replace]');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
let timetables = seed.timetables || [];
let campGroups = seed.campGroups || [];
if (!timetables.length) {
  console.error('시드 파일에 timetables 가 없습니다.');
  process.exit(1);
}
// --camp <CODE> : 같은 프리셋을 다른 캠프에 적용 (그 캠프의 그룹-반 설정을 따른다)
const campArg = process.argv.indexOf('--camp');
const targetCamp = campArg > -1 ? process.argv[campArg + 1] : null;
const campCode = targetCamp || timetables[0].campCode;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

(async () => {
  const campSnap = await db.collection('jobCodes').where('code', '==', campCode).limit(1).get();
  if (campSnap.empty) {
    console.error(`jobCodes 에 캠프 코드 "${campCode}" 가 없습니다.`);
    process.exit(1);
  }
  const jobCodeId = campSnap.docs[0].id;
  console.log(`캠프 ${campCode} → ${jobCodeId}\n`);

  if (targetCamp) {
    // 대상 캠프의 그룹-반 설정으로 갈아끼운다. 그룹 이름이 달라도(Junior↔Spring) 순서로 맞춘다.
    const settings = await db.collection('campSettings').doc(campCode).get();
    const groups = (settings.exists && settings.data().groups) || [];
    if (!groups.length) {
      console.error(`campSettings/${campCode}.groups 가 없습니다. 먼저 그룹-반 설정을 만들어 주세요.`);
      process.exit(1);
    }
    campGroups = groups;

    // 시드의 그룹을 등장 순서대로 정렬 → 대상 캠프 그룹과 1:1
    const srcOrder = [];
    timetables.forEach((t) => {
      if (!srcOrder.includes(t.groupName)) srcOrder.push(t.groupName);
    });
    const pair = new Map();
    srcOrder.forEach((name, i) => {
      if (groups[i]) pair.set(name, groups[i]);
    });
    console.log(
      '  그룹 매핑: ' + [...pair.entries()].map(([a, b]) => `${a}→${b.name}`).join(', ') +
        (srcOrder.length > groups.length ? ` (남는 ${srcOrder.slice(groups.length).join(',')} 는 건너뜀)` : '')
    );

    const remapCells = (cells, map) =>
      cells ? Object.fromEntries(Object.entries(cells).map(([k, v]) => [map.get(k) ?? k, v])) : cells;

    timetables = timetables
      .filter((t) => pair.has(t.groupName))
      .map((t) => {
        const target = pair.get(t.groupName);
        const src = t.classes.map((c) => c.classCode);
        const dst = target.classCodes;
        const map = new Map(src.map((c, i) => [c, dst[i] ?? c]));
        return {
          ...t,
          campCode,
          groupName: target.name,
          classes: dst.map((code, i) => ({
            ...(t.classes[i] || {}),
            classCode: code,
            // 반이름은 캠프마다 다르므로 비운다 (관리자가 채우거나 시트에서 가져옴)
            className: '',
          })),
          subjects: (t.subjects || []).map((x) =>
            x.ownerClassCode ? { ...x, ownerClassCode: map.get(x.ownerClassCode) ?? x.ownerClassCode } : x
          ),
          extraColumns: (t.extraColumns || []).map((e) =>
            e.dutyRotation ? { ...e, dutyRotation: e.dutyRotation.map((c) => map.get(c) ?? c) } : e
          ),
          blocks: t.blocks.map((bk) => (bk.cells ? { ...bk, cells: remapCells(bk.cells, map) } : bk)),
        };
      });
  }

  const existing = await db.collection('campTimetables').where('jobCodeId', '==', jobCodeId).get();
  const byKey = new Map();
  existing.forEach((d) => byKey.set(`${d.data().groupName}__${d.data().dayType}`, d.id));

  if (replace && existing.size) {
    console.log(`기존 ${existing.size}건 삭제${apply ? '' : ' (드라이런)'}`);
    if (apply) {
      const batch = db.batch();
      existing.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      byKey.clear();
    }
  }

  const now = admin.firestore.Timestamp.now();
  const actor = 'seed-script';
  let created = 0;
  let updated = 0;

  for (const t of timetables) {
    const key = `${t.groupName}__${t.dayType}`;
    const id = byKey.get(key) ?? randomUUID();
    const isUpdate = byKey.has(key);
    const doc = {
      campCode: t.campCode,
      jobCodeId,
      groupName: t.groupName,
      dayType: t.dayType,
      dayTypeLabel: t.dayTypeLabel,
      layout: t.layout ?? 'time',
      order: t.order ?? 0,
      classes: t.classes ?? [],
      extraColumns: t.extraColumns ?? [],
      subjects: t.subjects ?? [],
      blocks: t.blocks ?? [],
      note: t.note ?? '',
      updatedAt: now,
      updatedBy: actor,
      ...(isUpdate ? {} : { createdAt: now, createdBy: actor }),
    };

    const sets = doc.blocks.filter((b) => b.kind === 'class' && (b.times || []).length === 2).length;
    const shared = doc.blocks.filter((b) => b.kind === 'shared').length;
    const owners = doc.subjects.filter((s) => s.partner === 'owner' || s.partner === 'ownTeacher').length;
    const foreigns = doc.subjects.filter((s) => s.partner === 'foreign').length;
    console.log(
      `  ${isUpdate ? '갱신' : '생성'}  ${doc.dayTypeLabel.padEnd(12)} ${doc.groupName.padEnd(8)} ` +
        `[${doc.layout}] 반 ${doc.classes.length} · 줄 ${String(doc.blocks.length).padStart(2)} ` +
        `(세트 ${sets}, 공통 ${shared}) · 과목 ${doc.subjects.length} (원어민 ${foreigns}, 담임 ${owners})`
    );

    if (apply) {
      await db.collection('campTimetables').doc(id).set(doc);
      isUpdate ? updated++ : created++;
    }
  }

  if (campGroups.length && !targetCamp) {
    // 반번호가 두 그룹에 겹치면 담임 조인이 꼬이므로 먼저 나온 그룹만 남긴다
    const seen = new Set();
    const kept = [];
    const dropped = [];
    for (const g of campGroups) {
      const clash = g.classCodes.filter((c) => seen.has(c));
      if (clash.length) {
        dropped.push(`${g.name}(${clash.join(',')} 중복)`);
        continue;
      }
      g.classCodes.forEach((c) => seen.add(c));
      kept.push(g);
    }
    console.log(`\ncampSettings/${campCode}.groups ← ${kept.map((g) => `${g.name}(${g.classCodes.length})`).join(', ')}`);
    if (dropped.length) console.log(`  제외: ${dropped.join(', ')}`);
    if (apply) {
      await db
        .collection('campSettings')
        .doc(campCode)
        .set({ campCode, groups: kept, updatedAt: new Date().toISOString() }, { merge: true });
    }
  }

  if (seed.warnings?.length) {
    console.log('\n변환 경고:');
    seed.warnings.forEach((w) => console.log('  -', w));
  }

  console.log(
    apply ? `\n완료: 생성 ${created}건, 갱신 ${updated}건` : '\n드라이런입니다. --apply 를 붙여 다시 실행하세요.'
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
