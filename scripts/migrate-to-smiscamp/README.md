# smis-mentor → smiscamp 이관

새 프로젝트: 이름 smiscamp · id **smiscamp-bacba** · 번호 628518329710 · 버킷 smiscamp-bacba.firebasestorage.app

결정 (2026-10-05): 커뮤니티 제거 · 지난 캠프 데이터 모두 옮김 · Storage 파일 복사(주소 바꿈) · 캠프 열쇠 campCode.
검토 문서: 프로젝트 문서 `claude/smiscamp-firestore-review.md`.

## 순서
1. **새 프로젝트 준비** — Firestore `asia-northeast3`, 삭제 보호 켜기, Blaze, Storage 버킷.
   트리거 · 예약 작업은 **아직 배포하지 않는다** (복사 중에 chatOnUserWritten · auditUserChanges 가 돈다).
2. **지금 프로젝트 정리** — `scripts/prep-current-project.cjs` (ssn · campkeys · interview-copy · eval-summary · locations).
3. **Auth** — 원본 콘솔 › Authentication › 사용자 › ⋮ › 비밀번호 해시 매개변수를 적어 둔 뒤:
   ```
   firebase auth:export users.json --format=json --project smis-mentor
   firebase auth:import users.json --project smiscamp-bacba --hash-algo=SCRYPT \
     --hash-key=<base64_signer_key> --salt-separator=<base64_salt_separator> --rounds=8 --mem-cost=14
   ```
   uid 가 그대로여야 한다 (users 문서 id = Auth uid). users.json 은 개인정보 — 끝나면 지운다.
4. **Storage 파일** — 메타데이터(다운로드 토큰)까지 같이 복사해야 바뀐 주소가 열린다:
   ```
   gcloud storage cp -r "gs://smis-mentor.firebasestorage.app/*" gs://smiscamp-bacba.firebasestorage.app/
   ```
   복사 뒤 바뀐 주소 하나를 브라우저로 열어 확인.
5. **Firestore 미리보기** → **복사** → **확인**
   ```
   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키> --new-bucket smiscamp-bacba.firebasestorage.app
   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키> --target <smiscamp 키> --write
   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키> --target <smiscamp 키> --verify
   ```
6. **연결표 다시 채우기** — `scripts/backfill-auth-identities.cjs <smiscamp 키> --write`
7. **배포** — 규칙 · 색인 → Functions(트리거 · 예약 작업 2개 다시 만들기) → 웹(Vercel 환경 변수: 새 프로젝트 키 · `RRN_ENCRYPTION_KEY` 같은 값) → 새 앱.
   `cleanupOrphanedSocialAccounts` 는 Auth 와 users 가 맞는지 확인한 뒤 켠다.

## 계획 (plan.cjs)
- 복사하지 않음: posts · comments(커뮤니티), userEvaluationSummaries, user_id_mappings_backup*, 만료된 shareTokens,
  userLocations, rateLimits · pushReceiptQueue · mcp 토큰류, parentLinks(옛 방식)
- **학생 명단 (students.cjs)** — 시트 사본(stSheetCache · familySTSheetCache · stSheetSensitive · stSheetOverrides)을
  SMIS CAMP 원본으로 바꾼다: `children/{아이}`(+ private/identity) · `camps/{캠프}/enrollments/{시트 고유번호}` · `families` · `roster/current`
  - 같은 아이 = 이름 + 보호자 번호 (여러 캠프를 한 아이로), 아이 칸은 최근 캠프 값
  - 참가 문서 id 는 시트 고유번호 그대로 → 보건 · 용돈 · 기기 · 메모 기록이 그대로 이어진다
  - 주민번호 원본은 지금 · 다가오는 캠프만 암호화해서 (지난 캠프는 가린 값만)
  - 가족 캠프는 가족 명단만 (같은 캠프의 옛 stSheetCache 사본은 버림)
  - 2026-10-05 미리보기: 캠프 41 · 참가 3,879 · 아이 3,419 (여러 캠프에 온 아이 342) · 가족 390 · 주민번호 원본 92 (J29 · S29)
    · 보호자 번호 없는 줄 122 · 같은 캠프에 같은 아이 두 줄 18 (따로 아이로 — 관리자 학생 명단에서 확인)
  - **E29 · F29 는 아직 시트 사본이 없다** → 전환 전에 옛 앱에서 마지막 동기화를 하거나, 전환 뒤 관리자 › 학생 명단 관리 › 엑셀 붙여넣기
- 바꾸기: jobBoards 면접 정보 → private/interview, campRosters · generationResources 문서 id → campCode,
  campPages campCode 채움, lessonMaterials 빈 껍데기 건너뜀 · 중복은 섹션을 모음, 지운 템플릿 · 안 쓰는 면접 대본 건너뜀
- users 버리는 필드: 빈 password, rrnLast · birthDate · ssn 등 죽은 필드, 쓰기만 하던 표시, 기기 상태(새 앱이 다시 등록), phone(phoneNumber 와 같음)
- 모든 문자열의 Storage 주소 버킷 → 새 버킷 (경로 · 토큰은 그대로)
- 계획에 없는 컬렉션은 옮기지 않고 보고서에 남긴다

## 전환 당일 도구
- **옛 프로젝트 잠금** (appConfig 읽기만 열고 나머지 읽기 · 쓰기 금지, 새 업로드 금지):
  `firebase deploy --only firestore:rules,storage --project smis-mentor --config scripts/migrate-to-smiscamp/lock/firebase.json`
  되돌리기: main 에서 `firebase deploy --only firestore:rules,storage --project smis-mentor`
- **예약 작업 멈춤 · 만들기**: `scripts/smiscamp-scheduler.cjs` (옛 프로젝트 `--pause`, 새 프로젝트 `--create --invoker <firebase-adminsdk 주소>`)
- **웹 점검 모드** (Vercel 환경 변수, `packages/web/src/proxy.ts`): `MAINTENANCE_MODE=all`(화면 + API) · `1`(화면만), `MAINTENANCE_BYPASS_TOKEN` 으로 시험하는 사람만 통과
- **학생 주민번호**: 지금 · 다가오는 캠프만 아이 private 으로 옮기고 암호화한다 → `--write` 때 `RRN_ENCRYPTION_KEY`(웹과 같은 값) 환경 변수가 필요
- **마지막 시트 동기화**: 옛 앱(main)의 동기화 버튼으로 29기 시트를 한 번 더 읽은 뒤 잠근다 — 그 뒤 시트는 읽기 전용 보관
