#!/usr/bin/env node
/**
 * 타입 오류 ratchet — 워크스페이스별 `tsc --noEmit` 오류 수가 기준선보다 늘면 실패.
 *
 *   node scripts/typecheck-ratchet.js            # 검사 (CI)
 *   node scripts/typecheck-ratchet.js --update   # 줄어든 수치를 기준선에 반영
 *
 * 기준선: scripts/typecheck-baseline.json (내려가기만 해야 함)
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'typecheck-baseline.json');
const PACKAGES = ['packages/shared', 'packages/web', 'packages/mobile', 'functions'];
const update = process.argv.includes('--update');

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const tsc = require.resolve('typescript/bin/tsc', { paths: [ROOT] });

let failed = false;
const next = { ...baseline };
for (const pkg of PACKAGES) {
  const cwd = path.join(ROOT, pkg);
  const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', '.'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const lines = out.split('\n').filter((l) => /error TS\d+/.test(l));
  const count = lines.length;
  const base = baseline[pkg];
  let mark = '';
  if (base === undefined) {
    mark = '(기준선 없음 → 기록)';
    next[pkg] = count;
  } else if (count > base) {
    mark = `❌ ${count - base}개 늘어남`;
    failed = true;
    console.log(lines.slice(0, 50).join('\n'));
  } else if (count < base) {
    mark = `✅ ${base - count}개 줄어듦${update ? ' → 기준선 갱신' : ' (--update 로 기준선을 낮춰 주세요)'}`;
    if (update) next[pkg] = count;
  } else {
    mark = '✅ 유지';
  }
  console.log(`${pkg.padEnd(18)} ${String(count).padStart(4)} / 기준 ${base ?? '-'}  ${mark}`);
}

if (update || Object.keys(next).length !== Object.keys(baseline).length) {
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
}
if (failed) {
  console.error('\n타입 오류가 기준선보다 늘었습니다. 새로 생긴 오류를 고쳐 주세요.');
  process.exit(1);
}
