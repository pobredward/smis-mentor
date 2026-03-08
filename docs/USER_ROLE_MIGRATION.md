# User Role 마이그레이션 가이드

## 개요

기존의 4가지 role 체계를 5가지 role 체계로 변경합니다.

### 기존 Role 체계
- `user` - 일반 멘토
- `mentor` - 멘토 (검수자)
- `foreign` - 원어민
- `admin` - 관리자

### 새로운 Role 체계
- `mentor_temp` - 멘토 (회원가입 전) - 임시 사용자
- `mentor` - 멘토 (회원가입 후) - 정식 멘토
- `foreign_temp` - 원어민 (회원가입 전) - 임시 사용자
- `foreign` - 원어민 (회원가입 후) - 정식 원어민
- `admin` - 관리자

## 마이그레이션 규칙

1. `status = 'temp' && role = 'user'` → `role = 'mentor_temp'`
2. `status = 'active' && role = 'user'` → `role = 'mentor'`
3. `status = 'temp' && role = 'foreign'` → `role = 'foreign_temp'`
4. `role = 'mentor'` → 변경 없음
5. `role = 'foreign'` (status = 'active') → 변경 없음
6. `role = 'admin'` → 변경 없음

## 마이그레이션 실행

### 1. 사전 준비

```bash
# Firebase Admin SDK 서비스 계정 키 파일을 프로젝트 루트에 배치
# serviceAccountKey.json
```

### 2. 마이그레이션 스크립트 실행

```bash
npm run migrate:user-roles
```

### 3. 결과 확인

스크립트 실행 후 다음 정보가 출력됩니다:
- 총 사용자 수
- 마이그레이션된 사용자 수
- 건너뛴 사용자 수
- 마이그레이션된 사용자 상세 목록

## 회원가입 플로우 변경

### 임시 사용자 생성 (관리자)
1. 관리자가 임시 사용자 생성
2. `mentor_temp` 또는 `foreign_temp` 또는 `admin` 선택
3. 사용자 정보와 함께 저장

### 회원가입 완료
1. 임시 사용자가 회원가입 진행
2. 회원가입 3단계에서 `mentor` 또는 `foreign` 선택
3. 회원가입 완료 시:
   - 기존 `mentor_temp` → `mentor`로 자동 전환
   - 기존 `foreign_temp` → `foreign`로 자동 전환
   - 또는 선택한 role 직접 적용

## 주의사항

⚠️ **마이그레이션 전 백업 필수**

프로덕션 환경에서 실행하기 전에 반드시 데이터베이스 백업을 수행하세요.

```bash
# Firestore 백업 (Firebase Console 또는 CLI 사용)
firebase firestore:export gs://your-bucket/backups/$(date +%Y%m%d)
```

## 롤백

마이그레이션 후 문제가 발생한 경우:

1. 백업된 데이터 복원
2. 이전 코드 버전으로 롤백
3. 마이그레이션 스크립트 수정 후 재실행

## 영향을 받는 파일

### Shared Package
- `packages/shared/src/types/permission.ts`
- `packages/shared/src/services/admin/index.ts`

### Mobile App
- `packages/mobile/src/screens/UserGenerateScreen.tsx`
- `packages/mobile/src/screens/SignUpStep3Screen.tsx`
- `packages/mobile/src/screens/ProfileScreen.tsx`

### Web App
- `packages/web/src/app/admin/user-generate/page.tsx`
- `packages/web/src/app/sign-up/education/page.tsx`
- `packages/web/src/app/sign-up/details/page.tsx`

## 테스트 체크리스트

- [ ] 임시 사용자 생성 (mentor_temp, foreign_temp, admin)
- [ ] 회원가입 플로우 (role 선택 및 자동 전환)
- [ ] 기존 사용자 로그인 및 권한 확인
- [ ] 관리자 권한으로 사용자 관리
- [ ] 멘토 권한으로 학생 관리
- [ ] 원어민 권한 확인
