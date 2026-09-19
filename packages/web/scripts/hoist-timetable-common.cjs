/**
 * 표마다 따로 들고 있던 반 목록·이름·과목을 그룹당 한 벌로 올린다.
 *
 *   node scripts/hoist-timetable-common.cjs [--apply]
 *
 * 같은 그룹이면 Day(정규·스팀·입소…)가 달라도 반과 선생님, 과목은 같은 게 보통인데
 * 지금은 표마다 들고 있어 Day 수만큼 다시 넣어야 하고 조용히 어긋난다.
 * campSettings/{campCode}.timetableCommon[groupName] 에 한 벌만 두고,
 * 정말 다른 값을 쓰는 표에만 own 플래그를 켜서 자기 값을 쓰게 한다.
 *
 * roster   = classes + staffOverrides (반 구성 · 이름 수정)
 * subjects = 과목·주제 (스팀처럼 그 Day 만 다른 경우)
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

/** 그룹 이름 표기 흔들림 흡수 — shared 의 normalizeGroupKey 와 같은 규칙 */
const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

/** 비교용 정규화: 키 순서·빈 값 차이로 다르다고 보지 않게 */
const canonClasses = (classes) =>
  JSON.stringify(
    (classes || []).map((c) => ({
      classCode: c.classCode || '',
      teacherName: (c.teacherName || '').trim(),
    }))
  );
const canonStaff = (o) =>
  JSON.stringify(
    Object.entries(o || {})
      .map(([k, v]) => [k, (v || '').trim()])
      .filter(([, v]) => v)
      .sort(([a], [b]) => a.localeCompare(b))
  );
const canonSubjects = (subs) =>
  JSON.stringify(
    (subs || []).map((x) => ({
      key: x.key || '',
      partner: x.partner || 'none',
      ownerClassCode: x.ownerClassCode || '',
      roleKey: x.roleKey || '',
      teacherRole: x.teacherRole || '',
      partnerTeacherRole: x.partnerTeacherRole || '',
      partnerLabel: x.partnerLabel || '',
      room: x.room || '',
      partnerRoom: x.partnerRoom || '',
      color: x.color || '',
    }))
  );

/**
 * 공통으로 올릴 값 고르기.
 *
 * 정규 데이가 그 그룹의 기준이라, 정규에 값이 있으면 무조건 그걸 공통으로 삼는다.
 * (인문학·스팀처럼 특별한 Day 가 글자 수만 많다고 기준이 되면 곤란하다.)
 * 정규가 없을 때만 가장 많이 쓰인 값, 그마저 동수면 더 풍부한 쪽.
 */
function majority(entries, { preferRegular = false } = {}) {
  const byKey = new Map();
  entries.forEach(({ key, value }) => {
    if (!byKey.has(key)) byKey.set(key, { key, value, n: 0 });
    byKey.get(key).n += 1;
  });

  if (preferRegular) {
    const reg = entries.find((e) => e.doc?.t?.dayType === 'regular');
    if (reg) return { best: byKey.get(reg.key), variants: byKey.size, from: '정규' };
  }

  let best = null;
  for (const c of byKey.values()) {
    if (!best || c.n > best.n || (c.n === best.n && c.key.length > best.key.length)) best = c;
  }
  return { best, variants: byKey.size, from: '최다' };
}

(async () => {
  const snap = await db.collection('campTimetables').get();

  // (campCode, 그룹) 묶음
  const buckets = new Map();
  snap.forEach((d) => {
    const t = d.data();
    const camp = t.campCode || '';
    const group = t.groupName || '';
    if (!camp || !group) return;
    const k = `${camp}::${norm(group)}`;
    if (!buckets.has(k)) buckets.set(k, { camp, group, docs: [] });
    buckets.get(k).docs.push({ ref: d.ref, id: d.id, t });
  });

  const commonByCamp = {};   // campCode -> { groupName -> values }
  const ownUpdates = [];     // { ref, own, why }
  let rosterSplit = 0;
  let subjectSplit = 0;

  console.log(`표 ${snap.size}개 · 그룹 묶음 ${buckets.size}개\n`);

  for (const { camp, group, docs } of [...buckets.values()].sort((a, b) =>
    (a.camp + a.group).localeCompare(b.camp + b.group)
  )) {
    const rosterEntries = docs.map((d) => ({
      key: canonClasses(d.t.classes) + '|' + canonStaff(d.t.staffOverrides),
      value: { classes: d.t.classes || [], staffOverrides: d.t.staffOverrides || {} },
      doc: d,
    }));
    const subjEntries = docs
      // 과목이 아예 비어 있는 표는 "다르다" 고 보지 않는다 (기본값을 쓰는 중)
      .filter((d) => (d.t.subjects || []).length)
      .map((d) => ({ key: canonSubjects(d.t.subjects), value: d.t.subjects, doc: d }));

    const roster = majority(rosterEntries, { preferRegular: true });
    const subj = subjEntries.length
      ? majority(subjEntries, { preferRegular: true })
      : { best: null, variants: 0, from: '-' };

    if (!roster.best) continue;

    commonByCamp[camp] ??= {};
    commonByCamp[camp][group] = {
      classes: (roster.best.value.classes || []).map((c) => ({
        classCode: c.classCode,
        ...(c.teacherName && c.teacherName.trim() ? { teacherName: c.teacherName.trim() } : {}),
      })),
      staffOverrides: Object.fromEntries(
        Object.entries(roster.best.value.staffOverrides || {})
          .map(([k, v]) => [k, (v || '').trim()])
          .filter(([, v]) => v)
      ),
      subjects: subj.best ? subj.best.value : [],
    };

    console.log(`[${camp}] ${group} — 표 ${docs.length}개`);
    console.log(
      `   반·이름: ${roster.variants}가지` +
        (roster.variants > 1 ? '  ← 다른 표는 own.roster 로 남긴다' : '')
    );
    console.log(
      `   과목   : ${subj.variants}가지 (공통은 ${subj.from} 기준)` +
        (subj.variants > 1 ? '  ← 다른 표는 own.subjects 로 남긴다' : '')
    );

    for (const e of rosterEntries) {
      const own = {};
      if (e.key !== roster.best.key) {
        own.roster = true;
        rosterSplit += 1;
      }
      const mine = subjEntries.find((x) => x.doc.id === e.doc.id);
      if (subj.best && mine && mine.key !== subj.best.key) {
        own.subjects = true;
        subjectSplit += 1;
      }
      const cur = e.doc.t.own || {};
      const same = !!cur.roster === !!own.roster && !!cur.subjects === !!own.subjects;
      if (!same) {
        ownUpdates.push({
          ref: e.doc.ref,
          own,
          why: `${camp} ${group} · ${e.doc.t.dayTypeLabel || e.doc.t.dayType}`,
        });
      }
      if (own.roster || own.subjects) {
        console.log(
          `     · ${e.doc.t.dayTypeLabel || e.doc.t.dayType}  →  own ${JSON.stringify(own)}`
        );
      }
    }
    console.log('');
  }

  const campCount = Object.keys(commonByCamp).length;
  const groupCount = Object.values(commonByCamp).reduce((n, g) => n + Object.keys(g).length, 0);
  console.log('─'.repeat(60));
  console.log(`공통으로 올릴 그룹  : ${groupCount}개 (캠프 ${campCount}개)`);
  console.log(`own.roster 로 남김  : ${rosterSplit}개 표`);
  console.log(`own.subjects 로 남김: ${subjectSplit}개 표`);
  console.log(`own 플래그 쓸 문서  : ${ownUpdates.length}개`);

  if (!apply) {
    console.log('\n(미리보기입니다. 실제로 쓰려면 --apply)');
    return;
  }

  for (const [camp, groups] of Object.entries(commonByCamp)) {
    await db
      .collection('campSettings')
      .doc(camp)
      .set(
        { campCode: camp, timetableCommon: groups, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    console.log(`campSettings/${camp}.timetableCommon ← ${Object.keys(groups).length}개 그룹`);
  }
  for (const u of ownUpdates) {
    await u.ref.update({ own: u.own });
    console.log(`own ${JSON.stringify(u.own)} ← ${u.why}`);
  }
  console.log('\n완료.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
