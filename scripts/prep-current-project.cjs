/**
 * 지금 프로젝트(smis-mentor) 데이터 정리 — 이관 전에 해 두는 것 (2026-10-05 Firestore 검토)
 *
 * 실행 (기본은 미리보기 — 아무것도 쓰지 않고 숫자만):
 *   NODE_PATH=node_modules node scripts/prep-current-project.cjs <서비스계정키.json> --steps=ssn,campkeys,interview-copy
 *   NODE_PATH=node_modules node scripts/prep-current-project.cjs <서비스계정키.json> --steps=... --write
 *
 * 단계 (--steps 로 고른다, 쉼표로 여럿):
 *   ssn             users.ssn(평문 주민번호 전체) 필드 삭제 — 읽는 코드 없음
 *   campkeys        캠프 열쇠 campCode: campPages 에 campCode 채우기,
 *                   generationResources · campRosters 를 campCode 문서로 복사 (예전 jobCodeId 문서는 옛 앱용으로 남김)
 *   interview-copy  공고 면접 링크 · 안내문 · 소요 시간을 jobBoards/{id}/private/interview 로 복사 (공고 문서는 그대로)
 *   interview-strip 공고 문서의 interviewBase* · interviewPassword 지우기 (private/interview 가 있는 공고만)
 *                   ⚠ 1.8.0 이하 앱의 지원자 화면은 면접 링크를 공고 문서에서 읽는다 — 앱 업데이트 뒤에 권장
 *   eval-summary    users.evaluationSummary 를 evaluations 로 다시 계산 (평가 없는 사람은 필드 삭제)
 *   locations       14일 지난 userLocations 삭제 (위치 기록 보존 기간 — 함수가 배포되면 자동)
 *
 * 개인정보(이름 · 이메일 · 번호 · 값)는 출력하지 않는다. 쓰기는 400개씩 batch.
 */
const path = require('path');
const admin = require('firebase-admin');
const keyFile = process.argv[2];
const WRITE = process.argv.includes('--write');
const stepsArg = (process.argv.find((a) => a.startsWith('--steps=')) || '').slice(8);
const STEPS = new Set(stepsArg.split(',').map((s) => s.trim()).filter(Boolean));
const ALL = ['ssn', 'campkeys', 'interview-copy', 'interview-strip', 'eval-summary', 'locations'];
if (!keyFile || STEPS.size === 0 || [...STEPS].some((s) => !ALL.includes(s))) {
  console.error(`사용: node scripts/prep-current-project.cjs <키.json> --steps=${ALL.join(',')} [--write]`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyFile))) });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;
const { computeEvaluationSummary } = require(path.resolve(__dirname, '../packages/shared/dist/utils/evaluationSummary.js'));

/** 400개씩 나눠 쓰기 */
async function commitAll(ops) {
  let n = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) op(batch);
    if (WRITE) await batch.commit();
    n += Math.min(400, ops.length - i);
  }
  return n;
}
const say = (step, msg) => console.log(`[${step}] ${msg}`);

async function stepSsn() {
  const snap = await db.collection('users').where('ssn', '!=', null).get();
  const ops = snap.docs.map((d) => (b) => b.update(d.ref, { ssn: FieldValue.delete() }));
  say('ssn', `users.ssn 있는 문서 ${snap.size}개 → 필드 삭제 ${WRITE ? '완료' : '(미리보기)'}`);
  await commitAll(ops);
}

async function stepCampKeys() {
  const jc = await db.collection('jobCodes').select('code').get();
  const codeOf = new Map(jc.docs.map((d) => [d.id, String(d.get('code') || '').trim()]));
  // campPages.campCode
  const pages = await db.collection('campPages').select('jobCodeId', 'campCode').get();
  const pageOps = []; let pageMissing = 0;
  pages.forEach((d) => {
    const code = codeOf.get(d.get('jobCodeId'));
    if (!code) { pageMissing++; return; }
    if (d.get('campCode') !== code) pageOps.push((b) => b.update(d.ref, { campCode: code }));
  });
  say('campkeys', `campPages ${pages.size}개 중 campCode 채울 것 ${pageOps.length}개 (캠프를 못 찾은 것 ${pageMissing})`);
  await commitAll(pageOps);
  // generationResources · campRosters → campCode 문서
  for (const col of ['generationResources', 'campRosters']) {
    const snap = await db.collection(col).get();
    const ops = []; let already = 0, missing = 0;
    for (const d of snap.docs) {
      const code = codeOf.get(d.id);
      if (!code) { if (![...codeOf.values()].includes(d.id)) missing++; continue; } // 이미 campCode 문서이거나 모르는 것
      const target = db.collection(col).doc(code);
      const exists = snap.docs.some((x) => x.id === code);
      if (exists) { already++; continue; }
      ops.push((b) => b.set(target, { ...d.data(), campCode: code, jobCodeId: d.id }));
    }
    say('campkeys', `${col} ${snap.size}개 → campCode 문서로 복사 ${ops.length}개 (이미 있음 ${already}, 캠프 못 찾음 ${missing})`);
    await commitAll(ops);
  }
}

const INTERVIEW_FIELDS = ['interviewBaseLink', 'interviewBaseNotes', 'interviewBaseDuration'];
const LEGACY_FIELDS = [...INTERVIEW_FIELDS, 'interviewPassword'];

async function stepInterviewCopy() {
  const boards = await db.collection('jobBoards').get();
  const ops = []; let skipped = 0;
  for (const d of boards.docs) {
    const x = d.data();
    const data = {};
    for (const k of INTERVIEW_FIELDS) if (x[k] !== undefined && x[k] !== null && x[k] !== '') data[k] = x[k];
    if (!Object.keys(data).length) { skipped++; continue; }
    const ref = d.ref.collection('private').doc('interview');
    const cur = await ref.get();
    const merged = { ...data, ...(cur.exists ? cur.data() : {}), updatedAt: Timestamp.now() }; // 이미 옮긴 값이 있으면 그것이 먼저
    ops.push((b) => b.set(ref, merged, { merge: true }));
  }
  say('interview-copy', `공고 ${boards.size}개 → private/interview 로 복사 ${ops.length}개 (면접 정보 없음 ${skipped})`);
  await commitAll(ops);
}

async function stepInterviewStrip() {
  const boards = await db.collection('jobBoards').get();
  const ops = []; let notCopied = 0;
  for (const d of boards.docs) {
    const x = d.data();
    if (!LEGACY_FIELDS.some((k) => k in x)) continue;
    const priv = await d.ref.collection('private').doc('interview').get();
    const hasInfo = INTERVIEW_FIELDS.some((k) => x[k] !== undefined && x[k] !== null && x[k] !== '');
    if (hasInfo && !priv.exists) { notCopied++; continue; } // 먼저 interview-copy
    const del = Object.fromEntries(LEGACY_FIELDS.filter((k) => k in x).map((k) => [k, FieldValue.delete()]));
    ops.push((b) => b.update(d.ref, del));
  }
  say('interview-strip', `공개 공고 문서에서 면접 필드 지우기 ${ops.length}개 (아직 복사 안 된 공고 ${notCopied} — 건너뜀)`);
  await commitAll(ops);
}

async function stepEvalSummary() {
  const evals = await db.collection('evaluations').select('refUserId', 'evaluationStage', 'totalScore', 'evaluationDate').get();
  const byUser = new Map();
  evals.forEach((d) => {
    const uid = d.get('refUserId');
    if (!uid) return;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push({ id: d.id, evaluationStage: d.get('evaluationStage'), totalScore: d.get('totalScore'), evaluationDate: d.get('evaluationDate') ?? null });
  });
  const users = await db.collection('users').select('evaluationSummary').get();
  const now = Timestamp.now();
  const ops = []; let removed = 0, set = 0, noUserDoc = 0;
  const userIds = new Set(users.docs.map((d) => d.id));
  for (const uid of byUser.keys()) if (!userIds.has(uid)) noUserDoc++;
  for (const d of users.docs) {
    const list = byUser.get(d.id) || [];
    const summary = computeEvaluationSummary(list, now);
    if (summary) { set++; ops.push((b) => b.update(d.ref, { evaluationSummary: summary })); }
    else if (d.get('evaluationSummary') !== undefined) { removed++; ops.push((b) => b.update(d.ref, { evaluationSummary: FieldValue.delete() })); }
  }
  say('eval-summary', `평가 ${evals.size}개 · 평가 받은 사람 ${byUser.size}명 → 요약 다시 씀 ${set}명, 요약 지움 ${removed}명 (users 문서 없는 평가 대상 ${noUserDoc}명)`);
  await commitAll(ops);
}

async function stepLocations() {
  const cutoff = Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const snap = await db.collection('userLocations').where('updatedAt', '<', cutoff).get();
  say('locations', `14일 지난 위치 기록 ${snap.size}개 삭제`);
  await commitAll(snap.docs.map((d) => (b) => b.delete(d.ref)));
}

(async () => {
  console.log(WRITE ? '✍️  쓰기 모드' : '👀 미리보기 (쓰려면 --write)');
  if (STEPS.has('ssn')) await stepSsn();
  if (STEPS.has('campkeys')) await stepCampKeys();
  if (STEPS.has('interview-copy')) await stepInterviewCopy();
  if (STEPS.has('interview-strip')) await stepInterviewStrip();
  if (STEPS.has('eval-summary')) await stepEvalSummary();
  if (STEPS.has('locations')) await stepLocations();
  console.log('끝');
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
