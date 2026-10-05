/**
 * Cloud Scheduler 작업 — HTTP 함수 2개(checkOverdueTasks · cleanupOrphanedSocialAccounts)는 firebase deploy 가 예약 작업을 만들지 않아 따로 만든다.
 * (chatSendScheduled 는 onSchedule 이라 배포가 만든다)
 *
 *   보기:        NODE_PATH=functions/node_modules node scripts/smiscamp-scheduler.cjs --key <서비스 계정 키.json> --project smiscamp-bacba
 *   만들기:      ... --invoker <firebase-adminsdk-…@smiscamp-bacba.iam.gserviceaccount.com> --create
 *   멈춤 · 재개: ... --pause  /  --resume      (전환 때 옛 프로젝트: --project smis-mentor --pause)
 *
 * 함수는 OIDC 토큰의 계정이 이 프로젝트 서비스 계정인지 확인한다 (functions/src/index.ts verifyInvoker).
 */
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (n) => process.argv.includes(n);
const KEY = arg('--key');
const PROJECT = arg('--project');
const INVOKER = arg('--invoker');
const REGION = 'asia-northeast3';
if (!KEY || !PROJECT) { console.error('--key <키.json> --project <프로젝트 id> 가 필요합니다'); process.exit(1); }

const fnUrl = (name) => `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;
// 업무 알림은 매분 (업무 시각 1분 안에 도착 — 10/5 결정), 소셜 고아 계정 정리는 매일 새벽 3시
const JOBS = [
  { id: 'check-overdue-tasks', fn: 'checkOverdueTasks', schedule: '* * * * *', description: '업무 알림 · 위치 기록 정리 · 푸시 영수증' },
  { id: 'cleanup-orphaned-social-accounts', fn: 'cleanupOrphanedSocialAccounts', schedule: '0 3 * * *', description: 'users 문서 없는 소셜 Auth 계정 정리' },
];

(async () => {
  const auth = new GoogleAuth({ keyFile: path.resolve(KEY), scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const c = await auth.getClient();
  const base = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs`;
  const list = ((await c.request({ url: base })).data.jobs || []);
  const byId = new Map(list.map((j) => [j.name.split('/').pop(), j]));
  console.log(`${PROJECT} 예약 작업 ${list.length}개`);
  for (const j of list) console.log(`  - ${j.name.split('/').pop()}  ${j.schedule} (${j.timeZone})  ${j.state}`);

  if (has('--create')) {
    if (!INVOKER) { console.error('--create 에는 --invoker <서비스 계정 이메일> 이 필요합니다'); process.exit(1); }
    for (const job of JOBS) {
      if (byId.has(job.id)) { console.log(`= ${job.id} 이미 있음`); continue; }
      const url = fnUrl(job.fn);
      await c.request({
        url: base, method: 'POST',
        data: {
          name: `projects/${PROJECT}/locations/${REGION}/jobs/${job.id}`,
          description: job.description, schedule: job.schedule, timeZone: 'Asia/Seoul',
          attemptDeadline: '300s',
          httpTarget: { uri: url, httpMethod: 'POST', oidcToken: { serviceAccountEmail: INVOKER, audience: url } },
        },
      });
      console.log(`+ ${job.id} 만듦 → ${url}`);
    }
  }
  if (has('--pause') || has('--resume')) {
    const verb = has('--pause') ? 'pause' : 'resume';
    for (const j of list) {
      await c.request({ url: `https://cloudscheduler.googleapis.com/v1/${j.name}:${verb}`, method: 'POST' });
      console.log(`${verb} ${j.name.split('/').pop()}`);
    }
  }
})().catch((e) => { console.error('실패:', e.response?.status, e.response?.data?.error?.message || e.message); process.exit(1); });
