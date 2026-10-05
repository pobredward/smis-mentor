/**
 * 학생 명단 이관 — 시트 사본(stSheetCache · familySTSheetCache · stSheetSensitive · stSheetOverrides)
 *   → SMIS CAMP 원본: children/{childId} (+ private/identity), camps/{캠프}/enrollments/{학생 번호},
 *     camps/{캠프}/families/{가족} (+ private/identity), camps/{캠프}/roster/current, camps/{캠프}
 *
 * 규칙 (2026-10-05 결정):
 *  - 같은 아이 = 이름 + 보호자 번호가 같은 아이 (여러 캠프를 하나로 묶는다). 번호가 없으면 주민번호 앞 7자리 + 이름, 그것도 없으면 그 캠프에서만
 *  - 아이 칸(이름 · 연락처 · 주소 · 복용약 · 여권 …)은 가장 최근 캠프 값이 이긴다 (빈 값은 덮지 않음)
 *  - 참가 문서 id 는 시트 고유번호 그대로 (보건 · 용돈 · 기기 · 메모가 이 번호를 가리킨다). 없으면 row{행}
 *  - 상태는 모두 확정, 순서는 시트 행 번호
 *  - 주민번호 원본: 지금 · 다가오는 캠프만 암호화해서 private/identity 로. 지난 캠프는 가린 값(YYMMDD-G******)만
 *  - 시트 동기화 뒤에 남은 학생 카드 수정(stSheetOverrides)은 위에 덮는다
 *  - 가족 캠프는 가족 명단(familySTSheetCache)만 쓴다 — 같은 캠프의 stSheetCache 는 가족 파싱 전에 남은 옛 사본이라 버린다
 * 순수 함수 — 읽기 · 쓰기는 run.cjs 가 한다. 개인정보는 출력하지 않는다.
 */
const crypto = require('crypto');
const path = require('path');
const SHARED = path.join(__dirname, '../../packages/shared/dist');
const { sheetStudentToRecords, childMatchKey, toRosterStudent, toCampStudent, buildFamilyUnits, compareEnrollments } = require(`${SHARED}/utils/campStudent.js`);
const { maskSsnForStaff } = require(`${SHARED}/utils/campAccess.js`);

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 20);
const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');
const safeId = (v) => String(v ?? '').trim().replace(/[/\s]+/g, '-').replace(/^\.+$/, '').slice(0, 100);
/** 캠프 순서 — 기수 숫자 (J28 → 28, F27_2 → 27.2) */
const genKey = (code) => { const m = String(code).match(/^[A-Za-z]+(\d+)(?:_(\d+))?$/); return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0) : 0; };
const clean = (o) => JSON.parse(JSON.stringify(o));

/** 주민번호 → YYYY-MM-DD (성별 자리로 세기) */
function birthDateOf(ssn) {
  const d = digitsOf(ssn);
  if (d.length < 7) return '';
  const g = Number(d[6]);
  const century = g === 1 || g === 2 || g === 5 || g === 6 ? 1900 : g === 3 || g === 4 || g === 7 || g === 8 ? 2000 : g === 9 || g === 0 ? 1800 : 0;
  const mm = Number(d.slice(2, 4)); const dd = Number(d.slice(4, 6));
  if (!century || mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  return `${century + Number(d.slice(0, 2))}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}
const rawSsn = (v) => { const s = String(v ?? ''); const d = digitsOf(s); return d.length === 13 && !s.includes('*') ? `${d.slice(0, 6)}-${d.slice(6)}` : null; };

/** 학생 카드 수정 내역 → 학생에 덮기 (displayFields.칸 은 점이 든 글자 키로 저장돼 있다) */
function applyOverride(student, ov) {
  if (!ov) return student;
  const out = { ...student, displayFields: { ...(student.displayFields || {}) } };
  for (const [k, v] of Object.entries(ov)) {
    if (k === 'updatedAt' || k === 'updatedBy' || v === undefined || v === null) continue;
    if (k.startsWith('displayFields.')) out.displayFields[k.slice('displayFields.'.length)] = String(v);
    else if (k === 'displayFields' && typeof v === 'object') Object.assign(out.displayFields, v);
    else out[k] = v;
  }
  return out;
}

/**
 * @param {object} p
 * @param {Array<{campCode:string, students:object[]}>} p.rosters   stSheetCache 문서들 (data)
 * @param {Array<{campCode:string, families:object[]}>} p.familyCaches  familySTSheetCache 문서들
 * @param {Record<string, Record<string, {ssn?:string, ssnEnc?:string}>>} p.sensitive  캠프 → entries
 * @param {Record<string, Record<string, object>>} p.overrides  캠프 → 학생 번호 → 수정값
 * @param {Record<string, Record<string, object>>} [p.details]  캠프 → 학생 키 → 상세 (명단 나누기 뒤의 사본)
 * @param {Set<string>} p.current  지금 · 다가오는 캠프
 * @param {(plain:string)=>string} p.seal  암호화
 * @param {Date} p.now
 */
function buildStudentsNative(p) {
  const { rosters, familyCaches, sensitive = {}, overrides = {}, details = {}, current, seal, now } = p;
  const stats = { camps: 0, enrollments: 0, children: 0, sharedChildren: 0, noPhone: 0, solo: 0, identities: 0, familyIdentities: 0, families: 0, overrides: 0, dupInCamp: 0, pastRawSsnMasked: 0 };

  // 1) 캠프별 학생 줄 (가족 캠프는 가족 → 아이로 펼침)
  const entries = [];
  const familiesByCamp = new Map();
  const familyCodes = new Set(familyCaches.map((f) => f.campCode));
  stats.staleFamilyRosters = 0;
  for (const r of rosters) {
    if (familyCodes.has(r.campCode)) { stats.staleFamilyRosters++; continue; }
    (r.students || []).forEach((s0, i) => {
      if (!s0 || !String(s0.name || '').trim()) return;
      const key = String(s0.studentId || `row${s0.rowNumber ?? i + 2}`);
      let s = { ...s0, ...((details[r.campCode] || {})[key] || {}) };
      const ov = (overrides[r.campCode] || {})[s0.studentId];
      if (ov) { s = applyOverride(s, ov); stats.overrides++; }
      entries.push({ campCode: r.campCode, key, sensKey: key, order: Number(s0.rowNumber) || i + 2, s });
    });
  }
  for (const fc of familyCaches) {
    const fams = [];
    (fc.families || []).forEach((f, fi) => {
      const sens = sensitive[fc.campCode] || {};
      const idEntries = {};
      const parents = (f.parents || []).map((pp) => {
        const raw = rawSsn(pp.ssn) || (sens[`${f.familyId}__${pp.id}`] && (sens[`${f.familyId}__${pp.id}`].ssn ? rawSsn(sens[`${f.familyId}__${pp.id}`].ssn) : null));
        const enc = sens[`${f.familyId}__${pp.id}`]?.ssnEnc;
        if (current.has(fc.campCode) && (enc || raw)) idEntries[pp.id] = { ssnEnc: enc || seal(raw) };
        return { ...pp, ssn: pp.ssn ? maskSsnForStaff(pp.ssn) : undefined };
      });
      fams.push({ family: { familyId: f.familyId, familyType: f.familyType || '', parents, roomNumber: f.roomNumber || '', order: Number(f.rowNumber) || fi + 1 }, idEntries });
      (f.students || []).forEach((fs) => {
        if (!String(fs.name || '').trim()) return;
        const s = {
          studentId: fs.id, name: fs.name, englishName: fs.englishName || '', grade: fs.grade || '', gender: fs.gender,
          ssn: fs.ssn || '', passportName: fs.passportName || '', passportNumber: fs.passportNumber || '', passportExpiry: fs.passportExpiry || '',
          medication: fs.medication || '', parentPhone: fs.parentPhone || f.parents?.[0]?.phone || '', parentName: f.parents?.[0]?.name || '',
          registrationSource: fs.registrationSource || '', classNumber: fs.classNumber || '', className: fs.className || '', classMentor: fs.classMentor || '',
          familyId: f.familyId,
        };
        const ov = (overrides[fc.campCode] || {})[fs.id];
        entries.push({ campCode: fc.campCode, key: String(fs.id), sensKey: `${f.familyId}__${fs.id}`, order: Number(f.rowNumber) || fi + 1, s: ov ? applyOverride(s, ov) : s, familyId: f.familyId });
      });
    });
    familiesByCamp.set(fc.campCode, fams);
  }

  // 2) 오래된 캠프부터 — 아이 칸은 나중 캠프가 이긴다
  entries.sort((a, b) => genKey(a.campCode) - genKey(b.campCode) || a.campCode.localeCompare(b.campCode) || a.order - b.order);

  const children = new Map();      // childId → { data, identity?, camps:Set }
  const enrollments = new Map();   // campCode → [{ id, data }]
  const usedIds = new Map();       // campCode → Set(학생 번호)
  const childInCamp = new Map();   // campCode → Set(childId)

  for (const e of entries) {
    const { child, enrollment, ssn: rawFromSheet } = sheetStudentToRecords(e.s);
    const sens = (sensitive[e.campCode] || {})[e.sensKey] || (sensitive[e.campCode] || {})[e.key];
    const raw = rawFromSheet || (sens && sens.ssn ? rawSsn(sens.ssn) : null);
    const masked = e.s.ssn ? maskSsnForStaff(e.s.ssn) : raw ? maskSsnForStaff(raw) : '';
    if (!current.has(e.campCode) && rawFromSheet) stats.pastRawSsnMasked++;

    const phoneKey = childMatchKey(e.s.name, e.s.parentPhone);
    const ssn7 = digitsOf(masked).slice(0, 7);
    if (!phoneKey) stats.noPhone++;
    let matchKey = phoneKey || (ssn7.length === 7 ? `ssn:${ssn7}|${String(e.s.name).replace(/\s+/g, '')}` : null);
    let childId = matchKey ? sha(`child|${matchKey}`) : sha(`solo|${e.campCode}|${e.key}`);
    if (!matchKey) stats.solo++;
    // 같은 캠프에 같은 아이가 두 줄 — 둘째 줄은 따로 (운영진이 정리)
    if (!childInCamp.has(e.campCode)) childInCamp.set(e.campCode, new Set());
    if (childInCamp.get(e.campCode).has(childId)) { childId = sha(`dup|${e.campCode}|${e.key}`); matchKey = null; stats.dupInCamp++; }
    childInCamp.get(e.campCode).add(childId);

    let c = children.get(childId);
    if (!c) { c = { data: {}, identity: null, camps: new Set() }; children.set(childId, c); }
    for (const [k, v] of Object.entries(child)) if (v !== undefined && v !== null && v !== '') c.data[k] = v;
    if (masked) c.data.ssnMasked = masked;
    const bd = birthDateOf(raw || masked);
    if (bd) c.data.birthDate = bd;
    if (current.has(e.campCode)) {
      if (sens && sens.ssnEnc) c.identity = { ssnEnc: sens.ssnEnc };
      else if (raw) c.identity = { ssnEnc: seal(raw) };
    }
    c.camps.add(e.campCode);
    c.matchKey = phoneKey || null;

    // 참가 문서 id — 시트 고유번호 (겹치면 -2, -3)
    if (!usedIds.has(e.campCode)) usedIds.set(e.campCode, new Set());
    const used = usedIds.get(e.campCode);
    let id = safeId(e.key) || `row${e.order}`;
    for (let n = 2; used.has(id); n++) id = `${safeId(e.key)}-${n}`;
    used.add(id);
    if (!enrollments.has(e.campCode)) enrollments.set(e.campCode, []);
    enrollments.get(e.campCode).push({
      id,
      data: {
        ...enrollment, ...(e.familyId ? { familyId: e.familyId } : {}),
        studentId: id, childId, campCode: e.campCode, status: 'confirmed', order: e.order, parentIds: [],
        createdAt: now, updatedAt: now, createdBy: 'migration',
      },
    });
  }

  // 3) 쓸 문서
  const items = [];
  for (const [childId, c] of children) {
    if (c.camps.size > 1) stats.sharedChildren++;
    const name = c.data.name || '';
    const phone = c.data.parentPhone || '';
    items.push({
      path: `children/${childId}`,
      data: clean({
        ...c.data, childId, parentIds: [],
        nameKey: String(name).replace(/\s+/g, ''), phoneDigits: digitsOf(phone), matchKey: childMatchKey(name, phone),
        createdBy: 'migration', migratedFrom: [...c.camps].sort(),
      }),
      dates: { createdAt: now, updatedAt: now },
    });
    if (c.identity) { items.push({ path: `children/${childId}/private/identity`, data: { ...c.identity }, dates: { updatedAt: now } }); stats.identities++; }
  }
  stats.children = children.size;

  const camps = new Set([...enrollments.keys(), ...familiesByCamp.keys()]);
  const updatedAt = now.toISOString();
  for (const campCode of camps) {
    stats.camps++;
    const list = (enrollments.get(campCode) || []).sort((a, b) => compareEnrollments(a.data, b.data));
    stats.enrollments += list.length;
    for (const en of list) items.push({ path: `camps/${campCode}/enrollments/${en.id}`, data: clean({ ...en.data, createdAt: undefined, updatedAt: undefined }), dates: { createdAt: now, updatedAt: now } });
    const fams = familiesByCamp.get(campCode) || [];
    for (const { family, idEntries } of fams) {
      stats.families++;
      items.push({ path: `camps/${campCode}/families/${family.familyId}`, data: clean({ ...family, updatedAt, updatedBy: 'migration' }) });
      if (Object.keys(idEntries).length) { items.push({ path: `camps/${campCode}/families/${family.familyId}/private/identity`, data: { entries: idEntries } }); stats.familyIdentities++; }
    }
    // 목록용 명단 — 서버(campStudentsServer.buildRoster)와 같은 모양
    const famById = new Map(fams.map((f) => [f.family.familyId, f.family]));
    const withFamily = (row, en) => {
      const f = en.familyId ? famById.get(en.familyId) : undefined;
      return f ? { ...row, familyId: f.familyId, familyType: f.familyType || '', roomNumber: row.roomNumber || f.roomNumber || '' } : row;
    };
    const childOf = (en) => ({ ...children.get(en.childId).data, childId: en.childId });
    const students = list.map((en) => withFamily(toRosterStudent(childOf(en.data), en.data), en.data));
    const roster = { campCode, students, total: students.length, updatedAt, rosterRev: 0 };
    if (fams.length) {
      const full = list.map((en) => withFamily(toCampStudent(childOf(en.data), en.data), en.data));
      roster.families = buildFamilyUnits(fams.map((f) => f.family), full, campCode, updatedAt);
    }
    items.push({ path: `camps/${campCode}/roster/current`, data: clean(roster) });
    items.push({ path: `camps/${campCode}`, data: { campCode, rosterRev: 0, applicationOpen: false, migratedAt: updatedAt } });
  }
  return { items, stats };
}

module.exports = { buildStudentsNative, birthDateOf, applyOverride };
