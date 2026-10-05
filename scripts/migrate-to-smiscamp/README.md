# smis-mentor → smiscamp 이관

결정 (2026-10-05): 커뮤니티 제거 · 지난 캠프 데이터 모두 옮김 · Storage 파일 복사(주소 바꿈) · 캠프 열쇠 campCode.
검토 문서: 프로젝트 문서 `claude/smiscamp-firestore-review.md`.

## 순서
1. **새 프로젝트 준비** — Firestore `asia-northeast3`, 삭제 보호 켜기, Blaze, Storage 버킷.
   트리거 · 예약 작업은 **아직 배포하지 않는다** (복사 중에 chatOnUserWritten · auditUserChanges 가 돈다).
2. **지금 프로젝트 정리** — `scripts/prep-current-project.cjs` (ssn · campkeys · interview-copy · eval-summary · locations).
3. **Auth** — 원본 콘솔 › Authentication › 사용자 › ⋮ › 비밀번호 해시 매개변수를 적어 둔 뒤:
   ```
   firebase auth:export users.json --format=json --project smis-mentor
   firebase auth:import users.json --project smiscamp --hash-algo=SCRYPT \
     --hash-key=<base64_signer_key> --salt-separator=<base64_salt_separator> --rounds=8 --mem-cost=14
   ```
   uid 가 그대로여야 한다 (users 문서 id = Auth uid). users.json 은 개인정보 — 끝나면 지운다.
4. **Storage 파일** — 메타데이터(다운로드 토큰)까지 같이 복사해야 바뀐 주소가 열린다:
   ```
   gcloud storage cp -r "gs://smis-mentor.firebasestorage.app/*" gs://smiscamp.firebasestorage.app/
   ```
   복사 뒤 바뀐 주소 하나를 브라우저로 열어 확인.
5. **Firestore 미리보기** → **복사** → **확인**
   ```
   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키> --new-bucket smiscamp.firebasestorage.app
   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키> --target <smiscamp 키> --write
   NODE_PATH=node_modules node scripts/migrate-to-smiscamp/run.cjs --source <smis-mentor 키> --target <smiscamp 키> --verify
   ```
6. **연결표 다시 채우기** — `scripts/backfill-auth-identities.cjs <smiscamp 키> --write`
7. **배포** — 규칙 · 색인 → Functions(트리거 · 예약 작업 2개 다시 만들기) → 웹(Vercel 환경 변수: 새 프로젝트 키 · `RRN_ENCRYPTION_KEY` 같은 값) → 새 앱.
   `cleanupOrphanedSocialAccounts` 는 Auth 와 users 가 맞는지 확인한 뒤 켠다.

## 계획 (plan.cjs)
- 복사하지 않음: posts · comments(커뮤니티), userEvaluationSummaries, user_id_mappings_backup*, 만료된 shareTokens,
  userLocations, stSheetOverrides, rateLimits · pushReceiptQueue · mcp 토큰류
- 바꾸기: jobBoards 면접 정보 → private/interview, campRosters · generationResources 문서 id → campCode,
  campPages campCode 채움, lessonMaterials 빈 껍데기 건너뜀 · 중복은 섹션을 모음, 지운 템플릿 · 안 쓰는 면접 대본 건너뜀
- users 버리는 필드: 빈 password, rrnLast · birthDate · ssn 등 죽은 필드, 쓰기만 하던 표시, 기기 상태(새 앱이 다시 등록), phone(phoneNumber 와 같음)
- 모든 문자열의 Storage 주소 버킷 → 새 버킷 (경로 · 토큰은 그대로)
- 계획에 없는 컬렉션은 옮기지 않고 보고서에 남긴다
