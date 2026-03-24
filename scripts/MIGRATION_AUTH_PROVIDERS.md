# AuthProviders 마이그레이션 가이드

## 개요

기존 사용자들의 `authProviders` 필드를 마이그레이션하는 스크립트입니다. 이메일/비밀번호로 가입한 사용자들에게 `password` provider를 추가합니다.

## 마이그레이션이 필요한 이유

- 기존 회원가입 로직에서는 `authProviders` 배열을 저장하지 않았습니다
- 소셜 로그인 연동 기능 추가로 `authProviders` 필드가 필수가 되었습니다
- 기존 사용자가 구글/네이버로 로그인 시도 시 정확한 에러 메시지를 표시하기 위해 필요합니다

## 마이그레이션 대상

- ✅ `status: 'active'`인 사용자
- ✅ `email`이 존재하는 사용자
- ✅ `authProviders`가 없거나 비어있는 사용자

## 마이그레이션 제외 대상

- ❌ `status: 'temp'`인 사용자 (아직 회원가입 완료 안됨)
- ❌ `email`이 없는 사용자
- ❌ 이미 `authProviders`가 있는 사용자
- ❌ `status: 'inactive'` 또는 `'deleted'`인 사용자

## 실행 방법

### 1. Dry Run (실제 데이터 변경 없이 미리보기)

```bash
npm run migrate:auth-providers:dry-run
```

또는

```bash
ts-node --esm scripts/migrate-auth-providers.ts --dry-run
```

### 2. 실제 마이그레이션 실행

```bash
npm run migrate:auth-providers
```

또는

```bash
ts-node --esm scripts/migrate-auth-providers.ts
```

## Firebase 인증 설정

마이그레이션 스크립트 실행 전에 Firebase Admin 인증이 필요합니다.

### 방법 1: Service Account Key 사용 (권장)

1. Firebase Console → 프로젝트 설정 → 서비스 계정
2. "새 비공개 키 생성" 클릭
3. 다운로드한 JSON 파일을 프로젝트 루트에 `serviceAccountKey.json`으로 저장

```bash
# 프로젝트 루트에 파일 위치 확인
ls serviceAccountKey.json
```

### 방법 2: Application Default Credentials 사용

```bash
gcloud auth application-default login
```

## 마이그레이션 결과

스크립트 실행 후 다음과 같은 정보가 표시됩니다:

```
📈 마이그레이션 결과 요약
===============================================================================
총 사용자 수: 500
마이그레이션된 사용자: 450
건너뛴 사용자: 50
  - 이미 authProviders 있음: 10
  - temp 계정: 30
  - 이메일 없음: 5
  - 기타 (inactive/deleted): 5
===============================================================================
```

## 마이그레이션 후 데이터 구조

마이그레이션 전:
```json
{
  "userId": "user123",
  "email": "user@example.com",
  "name": "홍길동",
  "status": "active"
  // authProviders 없음
}
```

마이그레이션 후:
```json
{
  "userId": "user123",
  "email": "user@example.com",
  "name": "홍길동",
  "status": "active",
  "authProviders": [
    {
      "providerId": "password",
      "uid": "user123",
      "email": "user@example.com",
      "linkedAt": "2026-03-25T..."
    }
  ],
  "primaryAuthMethod": "password",
  "updatedAt": "2026-03-25T..."
}
```

## 주의사항

- ⚠️ 프로덕션 환경에서 실행하기 전에 반드시 **Dry Run**으로 먼저 확인하세요
- ⚠️ 백업을 권장합니다 (Firestore 자동 백업 확인)
- ⚠️ 배치 크기는 500개로 설정되어 있습니다 (Firestore 제한)
- ✅ 기존 사용자가 로그인 시에도 자동으로 `authProviders`가 추가됩니다 (점진적 마이그레이션)

## 트러블슈팅

### Firebase 인증 오류
```
Error: Could not load the default credentials
```

**해결 방법:**
1. `serviceAccountKey.json` 파일이 프로젝트 루트에 있는지 확인
2. 또는 `gcloud auth application-default login` 실행

### Permission Denied 오류
```
Error: 7 PERMISSION_DENIED: Missing or insufficient permissions
```

**해결 방법:**
- Service Account에 Firestore 읽기/쓰기 권한 부여
- Firebase Console → IAM 및 관리자 → IAM에서 역할 확인

## 관련 파일

- 마이그레이션 스크립트: `scripts/migrate-auth-providers.ts`
- 로그인 시 자동 마이그레이션: `packages/web/src/app/sign-in/SignInClient.tsx` (L70-86)
- 회원가입 시 저장: `packages/web/src/app/sign-up/details/page.tsx`
- 원어민 회원가입: `packages/web/src/app/sign-up/foreign/account/page.tsx`

## 롤백 방법

만약 마이그레이션을 롤백해야 한다면:

```javascript
// Firestore Console에서 실행하거나 별도 스크립트 작성
db.collection('users').get().then(snapshot => {
  snapshot.forEach(doc => {
    doc.ref.update({
      authProviders: admin.firestore.FieldValue.delete(),
      primaryAuthMethod: admin.firestore.FieldValue.delete()
    });
  });
});
```

## 문의

마이그레이션 관련 문제가 있으면 개발팀에 문의하세요.
