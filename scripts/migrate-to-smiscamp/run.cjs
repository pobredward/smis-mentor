/**
 * smis-mentor → smiscamp Firestore 이관 도구
 *
 * 미리보기 (원본만 읽고 보고서 — 아무것도 쓰지 않음):
 *   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키.json> --new-bucket smiscamp.firebasestorage.app
 * 복사 (새 프로젝트에 씀 — 새 프로젝트에 트리거 · 예약 작업을 배포하기 전에!):
 *   ... --target <smiscamp 키.json> --write
 * 확인 (복사 뒤 — 컬렉션별 문서 수 비교):
 *   ... --target <smiscamp 키.json> --verify
 * 옵션: --only users,jobBoards (일부만) · --report <파일> (보고서 JSON 저장, 기본 deploylogs 아래 아님 — 지정할 때만)
 *
 * 하는 일 (plan.cjs):
 *  - 학생 명단(시트 사본)은 아이 · 캠프 참가 · 가족 · 목록용 명단으로 바꾼다 (students.cjs) — 주민번호 원본은 지금 · 다가오는 캠프만 암호화
 *    → --write 에는 RRN_ENCRYPTION_KEY (웹과 같은 값) 환경 변수가 필요
 *  - 컬렉션별 복사 · 건너뛰기 · 바꾸기, 버리는 필드, 하위 컬렉션은 부모가 옮겨진 것만
 *  - Storage 주소의 버킷 이름을 새 버킷으로 (파일 자체는 gcloud storage cp 로 따로 — 메타데이터의 다운로드 토큰이 같이 가야 주소가 열린다)
 *  - 문서 id · 값의 형식(Timestamp 등)은 그대로
 * 개인정보는 출력하지 않는다 (숫자 · 필드 이름만).
 */
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { COLLECTIONS, SUBCOLLECTIONS, ST_DETAIL_FIELDS } = require('./plan.cjs');
const { buildStudentsNative } = require('./students.cjs');

/** 웹 lib/encryption.ts encryptRRN 과 같은 형식 — AES-256-GCM, base64(iv 16 + tag 16 + 암호문). 키는 RRN_ENCRYPTION_KEY (웹과 같은 값) */
function seal(plain) {
  const key = Buffer.from(process.env.RRN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('RRN_ENCRYPTION_KEY(32바이트 base64)가 필요합니다 — 웹과 같은 값');
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (name) => process.argv.includes(name);
const SOURCE = arg('--source');
const TARGET = arg('--target');
const WRITE = has('--write');
const VERIFY = has('--verify');
const NEW_BUCKET = arg('--new-bucket') || 'smiscamp-bacba.firebasestorage.app';
const ONLY = (arg('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const REPORT = arg('--report');
const OLD_BUCKETS = ['smis-mentor.firebasestorage.app', 'smis-mentor.appspot.com'];
if (!SOURCE) { console.error('--source <키.json> 가 필요합니다'); process.exit(1); }
if ((WRITE || VERIFY) && !TARGET) { console.error('--write · --verify 에는 --target <키.json> 이 필요합니다'); process.exit(1); }

const srcApp = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(SOURCE))) }, 'source');
const src = srcApp.firestore();
const dstApp = TARGET ? admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(TARGET))) }, 'target') : null;
const dst = dstApp ? dstApp.firestore() : null;
if (dst && dstApp.options.credential && require(path.resolve(TARGET)).project_id === require(path.resolve(SOURCE)).project_id) {
  console.error('원본과 대상이 같은 프로젝트입니다'); process.exit(1);
}

// ─── 값 바꾸기 ───────────────────────────────────────────────
const esc = (b) => b.replace(/\./g, '\\.');
/** [정규식, 바꿀 문자열] — 버킷 이름만 바꾼다 (경로 · 토큰은 그대로) */
const urlPatterns = OLD_BUCKETS.flatMap((b) => [
  [new RegExp(`firebasestorage\\.googleapis\\.com/v0/b/${esc(b)}/o/`, 'g'), `firebasestorage.googleapis.com/v0/b/${NEW_BUCKET}/o/`],
  [new RegExp(`storage\\.googleapis\\.com/${esc(b)}/`, 'g'), `storage.googleapis.com/${NEW_BUCKET}/`],
  [new RegExp(`gs://${esc(b)}/`, 'g'), `gs://${NEW_BUCKET}/`],
]);
/** 값 안의 Storage 주소 버킷 바꾸기 (Timestamp · 참조 등은 그대로). 바꾼 수를 센다 */
function rewrite(value, stat) {
  if (typeof value === 'string') {
    let out = value;
    for (const [re, to] of urlPatterns) out = out.replace(re, () => { stat.urls++; return to; });
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => rewrite(v, stat));
  if (value && typeof value === 'object' && value.constructor === Object) {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = rewrite(v, stat);
    return o;
  }
  return value; // Timestamp · GeoPoint · DocumentReference · Buffer
}

const newStat = () => ({ read: 0, write: 0, skipped: 0, dropped: {}, urls: 0, notes: [] });
const report = { at: new Date().toISOString(), newBucket: NEW_BUCKET, collections: {}, subcollections: {}, unplanned: [] };

function dropFields(data, fields, stat) {
  if (!fields) return data;
  const out = { ...data };
  for (const f of fields) if (f in out) { delete out[f]; stat.dropped[f] = (stat.dropped[f] || 0) + 1; }
  return out;
}

// ─── 컬렉션별 바꾸기 ─────────────────────────────────────────
let campCodeById = null;
async function campCodes() {
  if (!campCodeById) {
    const snap = await src.collection('jobCodes').get();
    campCodeById = new Map(snap.docs.map((d) => [d.id, String(d.get('code') || '').trim()]));
  }
  return campCodeById;
}

/** 끝나지 않은 캠프 (끝난 날이 오늘 이후 — 지금 · 다가오는 캠프) */
let currentCampSet = null;
async function currentCamps() {
  if (!currentCampSet) {
    const now = Date.now() - 24 * 60 * 60 * 1000;
    const snap = await src.collection('jobCodes').get();
    const endOf = (v) => (v && typeof v.toDate === 'function' ? v.toDate().getTime() : v ? new Date(v).getTime() : NaN);
    currentCampSet = new Set(snap.docs.filter((d) => endOf(d.get('endDate')) >= now).map((d) => String(d.get('code') || '').trim()).filter(Boolean));
  }
  return currentCampSet;
}

/** 원본 문서들 → [{ path, data }] (하위 문서 경로 포함) */
const TRANSFORMS = {
  /** 학생 명단 → 아이 · 캠프 참가 · 가족 · 목록용 명단 (students.cjs) */
  async studentsNative(docs, stat) {
    const [famSnap, sensSnap, ovSnap, detSnap, current] = await Promise.all([
      src.collection('familySTSheetCache').get(),
      src.collection('stSheetSensitive').get(),
      src.collectionGroup('students').get(),
      src.collectionGroup('details').get(),
      currentCamps(),
    ]);
    const overrides = {};
    ovSnap.forEach((d) => {
      const camp = d.ref.parent.parent;
      if (!camp || camp.parent.id !== 'stSheetOverrides') return;
      (overrides[camp.id] = overrides[camp.id] || {})[d.id] = d.data();
    });
    const details = {};
    detSnap.forEach((d) => {
      const camp = d.ref.parent.parent;
      if (!camp || camp.parent.id !== 'stSheetCache') return;
      (details[camp.id] = details[camp.id] || {})[d.id] = d.data();
    });
    const sensitive = {};
    sensSnap.forEach((d) => { sensitive[d.id] = d.get('entries') || {}; });
    const { items, stats } = buildStudentsNative({
      rosters: docs.map((d) => ({ campCode: d.id, students: Array.isArray(d.get('data')) ? d.get('data') : [] })),
      familyCaches: famSnap.docs.map((d) => ({ campCode: d.id, families: d.get('families') || [] })),
      sensitive, overrides, details, current,
      seal: (plain) => (WRITE ? seal(plain) : '(미리보기)'),
      now: new Date(),
    });
    stat.notes.push(`캠프 ${stats.camps} · 참가 ${stats.enrollments} · 아이 ${stats.children} (여러 캠프에 온 아이 ${stats.sharedChildren}) · 가족 ${stats.families}`);
    stat.notes.push(`보호자 번호 없음 ${stats.noPhone} (그중 캠프 하나로만 ${stats.solo}) · 같은 캠프에 두 줄 ${stats.dupInCamp} · 카드 수정 덮음 ${stats.overrides}`);
    stat.notes.push(`주민번호 원본 → 아이 ${stats.identities} · 가족 ${stats.familyIdentities} (지금 · 다가오는 캠프 ${[...current].join(', ') || '없음'}) · 지난 캠프 평문은 가린 값으로 ${stats.pastRawSsnMasked}`);
    stat.notes.push(`가족 캐시 ${famSnap.size} (같은 캠프의 옛 명단 사본 ${stats.staleFamilyRosters}개는 버림) · 주민번호 원본 ${sensSnap.size} · 수정 내역 캠프 ${Object.keys(overrides).length}`);
    return items;
  },
  async sealCurrentSensitive(docs, stat) {
    const current = await currentCamps();
    const out = [];
    for (const d of docs) {
      if (!current.has(d.id)) { stat.skipped++; continue; }
      const x = d.data();
      const entries = {};
      let sealed = 0;
      for (const [k, v] of Object.entries(x.entries || {})) {
        if (v && v.ssnEnc) entries[k] = { ssnEnc: v.ssnEnc };
        else if (v && v.ssn) { entries[k] = { ssnEnc: WRITE ? seal(v.ssn) : '(미리보기)' }; sealed++; }
      }
      stat.notes.push(`stSheetSensitive/${d.id}: ${sealed}건 암호화`);
      out.push({ path: `stSheetSensitive/${d.id}`, data: { ...x, entries } });
    }
    stat.notes.push(`stSheetSensitive: 지난 캠프 ${docs.length - out.length}개는 옮기지 않음 (export 보관 후 삭제) — 남긴 캠프 ${[...current].join(', ')}`);
    return out;
  },
  async splitRoster(docs, stat) {
    const DETAIL = new Set(ST_DETAIL_FIELDS);
    const out = [];
    let detailDocs = 0;
    for (const d of docs) {
      const x = d.data();
      const list = Array.isArray(x.data) ? x.data : [];
      const light = [];
      for (const s of list) {
        const l = {};
        const det = {};
        for (const [k, v] of Object.entries(s || {})) {
          if (DETAIL.has(k)) { if (v !== undefined && v !== null && v !== '') det[k] = v; } else l[k] = v;
        }
        light.push(l);
        if (Object.keys(det).length) {
          const key = String(s.studentId || `row${s.rowNumber ?? ''}`);
          out.push({ path: `stSheetCache/${d.id}/details/${key}`, data: { ...det, studentId: String(s.studentId || ''), name: String(s.name || '') } });
          detailDocs++;
        }
      }
      out.push({ path: `stSheetCache/${d.id}`, data: { ...x, data: light } });
    }
    stat.notes.push(`stSheetCache: 명단 ${docs.length}개 → 학생 상세 ${detailDocs}개로 나눔`);
    return out;
  },
  async devicesDropPastLockCodes(docs, stat) {
    const current = await currentCamps();
    return docs.map((d) => {
      const x = { ...d.data() };
      if (!current.has(String(x.campCode || '')) && 'lockCode' in x) { delete x.lockCode; stat.dropped.lockCode = (stat.dropped.lockCode || 0) + 1; }
      return { path: `studentDevices/${d.id}`, data: x };
    });
  },
  async jobBoard(docs, stat) {
    const out = [];
    const FIELDS = ['interviewBaseLink', 'interviewBaseNotes', 'interviewBaseDuration'];
    for (const d of docs) {
      const x = d.data();
      const board = { ...x };
      const interview = {};
      for (const k of FIELDS) if (k in board) { if (board[k] !== '' && board[k] != null) interview[k] = board[k]; delete board[k]; stat.dropped[k] = (stat.dropped[k] || 0) + 1; }
      if ('interviewPassword' in board) { delete board.interviewPassword; stat.dropped.interviewPassword = (stat.dropped.interviewPassword || 0) + 1; }
      out.push({ path: `jobBoards/${d.id}`, data: board });
      // 이미 옮긴 private/interview 가 있으면 그것을 하위 컬렉션 복사가 가져간다 — 공고 문서 값은 없을 때만
      if (Object.keys(interview).length) out.push({ path: `jobBoards/${d.id}/private/interview`, data: interview, ifAbsent: true });
    }
    return out;
  },
  async onlyCommon(docs, stat) {
    return docs.filter((d) => d.id === 'common' || (stat.skipped++, false)).map((d) => ({ path: `interviewScripts/${d.id}`, data: d.data() }));
  },
  async campPage(docs, stat) {
    const codes = await campCodes();
    return docs.map((d) => {
      const x = d.data();
      const code = codes.get(x.jobCodeId);
      if (!code) stat.notes.push(`campPages/${d.id}: 캠프 코드를 못 찾음`);
      return { path: `campPages/${d.id}`, data: code ? { ...x, campCode: code } : x };
    });
  },
  async rekeyByCampCode(docs, stat, col) {
    const codes = await campCodes();
    const codeSet = new Set(codes.values());
    const byId = new Map(docs.map((d) => [d.id, d]));
    const out = [];
    for (const d of docs) {
      if (codeSet.has(d.id)) { out.push({ path: `${col}/${d.id}`, data: { ...d.data(), campCode: d.id } }); continue; } // 이미 campCode 문서
      const code = codes.get(d.id);
      if (!code) { stat.skipped++; stat.notes.push(`${col}/${d.id}: 캠프를 못 찾아 건너뜀`); continue; }
      if (byId.has(code)) { stat.skipped++; continue; } // campCode 문서가 따로 있음 — 예전 문서는 버림
      out.push({ path: `${col}/${code}`, data: { ...d.data(), campCode: code, jobCodeId: d.id } });
    }
    return out;
  },
  async dropDeleted(docs, stat, col) {
    return docs.filter((d) => !(d.get('deleted') === true) || (stat.skipped++, false)).map((d) => ({ path: `${col}/${d.id}`, data: d.data() }));
  },
  async notExpired(docs, stat, col) {
    const now = Date.now();
    return docs.filter((d) => { const e = d.get('expiresAt'); const ok = !(e && e.toMillis && e.toMillis() < now); if (!ok) stat.skipped++; return ok; })
      .map((d) => ({ path: `${col}/${d.id}`, data: d.data() }));
  },
  async lessonMaterial(docs, stat) {
    // 섹션 수 · 템플릿 목록
    const secs = await src.collectionGroup('sections').get();
    const secCount = new Map();
    secs.forEach((s) => { const p = s.ref.parent.parent; if (p && p.parent.id === 'lessonMaterials') secCount.set(p.id, (secCount.get(p.id) || 0) + 1); });
    const templates = new Set((await src.collection('lessonMaterialTemplates').select().get()).docs.map((d) => d.id));
    // (사람, 템플릿) 묶기 — 섹션이 가장 많은 문서를 남기고 나머지 섹션은 그리로 모은다
    const groups = new Map();
    for (const d of docs) {
      const x = d.data();
      const key = x.templateId && !x.userCode ? `${x.userId}|${x.templateId}` : `single|${d.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    const out = []; const redirect = new Map(); let shells = 0, merged = 0;
    for (const [key, list] of groups) {
      list.sort((a, b) => (secCount.get(b.id) || 0) - (secCount.get(a.id) || 0));
      const keepDoc = list[0];
      const total = list.reduce((s, d) => s + (secCount.get(d.id) || 0), 0);
      const x = keepDoc.data();
      // 빈 껍데기: 섹션 0 · 템플릿 기반(사용자 주제 아님) · 템플릿이 있음 → 화면이 템플릿으로 보여 준다
      if (total === 0 && !key.startsWith('single|') && templates.has(x.templateId)) { shells += list.length; continue; }
      for (const other of list.slice(1)) { redirect.set(other.id, keepDoc.id); merged++; }
      out.push({ path: `lessonMaterials/${keepDoc.id}`, data: x });
    }
    stat.skipped += shells + merged;
    stat.notes.push(`빈 껍데기 ${shells}개 건너뜀, 중복 ${merged}개는 남은 문서로 섹션을 모음`);
    TRANSFORMS._lessonRedirect = redirect;
    return out;
  },
};

// ─── 실행 ────────────────────────────────────────────────────
const writtenParents = new Set();
async function writeAll(items, stat) {
  for (let i = 0; i < items.length; i += 400) {
    const chunk = items.slice(i, i + 400);
    if (WRITE) {
      const batch = dst.batch();
      for (const it of chunk) {
        if (it.ifAbsent) {
          const cur = await dst.doc(it.path).get();
          if (cur.exists) continue;
        }
        batch.set(dst.doc(it.path), it.data);
      }
      await batch.commit();
    }
    stat.write += chunk.length;
  }
}

async function runCollection(name, plan) {
  const stat = newStat();
  report.collections[name] = { mode: plan.mode, reason: plan.reason, stat };
  if (plan.mode === 'skip') {
    stat.skipped = (await src.collection(name).count().get()).data().count;
    return;
  }
  const snap = await src.collection(name).get();
  stat.read = snap.size;
  let items;
  if (plan.mode === 'transform') items = await TRANSFORMS[plan.transform](snap.docs, stat, name);
  else items = snap.docs.map((d) => ({ path: `${name}/${d.id}`, data: d.data() }));
  // dates: 날짜(Timestamp 로 쓸 값)는 주소 바꾸기 · JSON 정리 뒤에 붙인다
  items = items.map((it) => ({ ...it, data: { ...rewrite(dropFields(it.data, plan.drop, stat), stat), ...(it.dates || {}) } }));
  for (const it of items) writtenParents.add(it.path);
  await writeAll(items, stat);
}

async function runSubcollection(name, plan) {
  const stat = newStat();
  report.subcollections[name] = { mode: plan.mode, reason: plan.reason, stat };
  const snap = await src.collectionGroup(name).get();
  stat.read = snap.size;
  if (plan.mode === 'skip') { stat.skipped = snap.size; return; }
  const items = [];
  const redirect = TRANSFORMS._lessonRedirect || new Map();
  for (const d of snap.docs) {
    const parent = d.ref.parent.parent;
    if (!parent) { stat.skipped++; continue; }
    let parentPath = parent.path;
    if (parent.parent.id === 'lessonMaterials' && redirect.has(parent.id)) parentPath = `lessonMaterials/${redirect.get(parent.id)}`;
    // 부모가 다시 열쇠를 받은 경우(campRosters 등)는 하위 컬렉션이 없다. 부모가 옮겨진 것만
    if (!writtenParents.has(parentPath)) { stat.skipped++; continue; }
    items.push({ path: `${parentPath}/${name}/${d.id}`, data: rewrite(d.data(), stat) });
  }
  await writeAll(items, stat);
}

async function verify() {
  console.log('\n== 확인: 컬렉션별 문서 수 (원본 계획 → 대상)');
  for (const [name, r] of Object.entries(report.collections)) {
    if (r.mode === 'skip') continue;
    if (COLLECTIONS[name].verify) {
      // 다른 컬렉션으로 옮긴 것 — 대상 컬렉션 문서 수만 보여 준다
      for (const c of COLLECTIONS[name].verify) console.log(`${(name + ' → ' + c).padEnd(28)} ${' '.repeat(6)} → ${String((await dst.collection(c).count().get()).data().count).padStart(6)}`);
      const groups = ['enrollments', 'roster', 'families'];
      for (const g of groups) console.log(`${('  (camps/*/' + g + ')').padEnd(28)} ${' '.repeat(6)} → ${String((await dst.collectionGroup(g).count().get()).data().count).padStart(6)}`);
      continue;
    }
    const n = (await dst.collection(name).count().get()).data().count;
    console.log(`${name.padEnd(28)} ${String(r.stat.write).padStart(6)} → ${String(n).padStart(6)} ${n === r.stat.write ? 'OK' : '⚠ 다름'}`);
  }
}

(async () => {
  console.log(WRITE ? `✍️  쓰기: → ${require(path.resolve(TARGET)).project_id}` : '👀 미리보기 (원본만 읽음)');
  const roots = (await src.listCollections()).map((c) => c.id);
  for (const name of roots) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const plan = COLLECTIONS[name];
    if (!plan) { report.unplanned.push(name); continue; }
    await runCollection(name, plan);
    process.stdout.write('.');
  }
  // 하위 컬렉션 (lessonMaterials 정리 뒤 — 섹션을 남은 문서로 모은다)
  for (const [name, plan] of Object.entries(SUBCOLLECTIONS)) {
    if (ONLY.length && !ONLY.some((o) => ['users', 'jobBoards', 'chatRooms', 'lessonMaterials'].includes(o))) break;
    await runSubcollection(name, plan);
  }
  console.log('\n\n컬렉션                         읽음   씀  건너뜀  주소바꿈  버린 필드');
  for (const [name, r] of [...Object.entries(report.collections), ...Object.entries(report.subcollections).map(([k, v]) => [`(하위) ${k}`, v])]) {
    const s = r.stat;
    const dropped = Object.entries(s.dropped).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`${(r.mode === 'skip' ? '✗ ' : '  ') + name.padEnd(28)} ${String(s.read).padStart(5)} ${String(s.write).padStart(5)} ${String(s.skipped).padStart(6)} ${String(s.urls).padStart(8)}  ${dropped}`);
    for (const n of s.notes.slice(0, 5)) console.log(`      · ${n}`);
  }
  if (report.unplanned.length) console.log(`\n⚠ 계획 없는 컬렉션 (옮기지 않음): ${report.unplanned.join(', ')}`);
  if (VERIFY) await verify();
  if (REPORT) fs.writeFileSync(path.resolve(REPORT), JSON.stringify(report, null, 1));
  console.log('\n끝');
})().catch((e) => { console.error('실패:', e); process.exit(1); });
