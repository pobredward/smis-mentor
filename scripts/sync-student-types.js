#!/usr/bin/env node
/**
 * packages/shared/src/types/student.ts → functions/src/studentTypes.ts 자동 동기화
 *
 * 두 파일을 별도로 관리하다가 한 쪽을 빠뜨리는 실수를 방지합니다.
 * student.ts를 단일 소스로 유지하고, 이 스크립트가 studentTypes.ts를 덮어씁니다.
 *
 * 실행: node scripts/sync-student-types.js
 * 자동: build:functions 전에 prebuild로 실행됩니다.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../packages/shared/src/types/student.ts');
const DST = path.resolve(__dirname, '../functions/src/studentTypes.ts');

const AUTO_GENERATED_HEADER = `// =============================================================================
// ⚠️  이 파일은 자동 생성됩니다. 직접 수정하지 마세요.
//    단일 소스: packages/shared/src/types/student.ts
//    동기화:   node scripts/sync-student-types.js  (build:functions 전 자동 실행)
// =============================================================================
`;

const content = fs.readFileSync(SRC, 'utf-8');
const output = AUTO_GENERATED_HEADER + '\n' + content;

fs.writeFileSync(DST, output, 'utf-8');

console.log(`✅ studentTypes.ts 동기화 완료`);
console.log(`   소스: packages/shared/src/types/student.ts`);
console.log(`   대상: functions/src/studentTypes.ts`);
