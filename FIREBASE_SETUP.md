# Firebase Storage 설정 가이드

## 문제 상황
Firebase Storage에서 이미지 미리보기가 표시되지 않고, 다음과 같은 오류가 발생하는 경우:
```
Error 412: A required service account is missing necessary permissions.
```

## 해결 방법

### 1. 서비스 계정 키 파일 확인
`serviceAccountKey.json` 파일이 프로젝트 루트에 있는지 확인하세요.
- ✅ 이미 생성되었습니다.
- ⚠️ 이 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.

### 2. Firebase Storage Rules 배포

```bash
# Firebase CLI가 설치되어 있지 않다면
npm install -g firebase-tools

# Firebase 로그인
firebase login

# Storage Rules 배포
firebase deploy --only storage:rules
```

### 3. CORS 설정 적용

Firebase Storage에서 CORS 문제가 발생하는 경우, 다음 명령어로 CORS 설정을 적용하세요:

#### 방법 1: gsutil 사용 (권장)
```bash
# Google Cloud SDK 설치 필요
gsutil cors set cors.json gs://smis-mentor.firebasestorage.app
```

#### 방법 2: gcloud 사용
```bash
# Google Cloud CLI 설치 필요
gcloud storage buckets update gs://smis-mentor.firebasestorage.app --cors-file=cors.json
```

### 4. Firebase Console에서 권한 확인

1. [Firebase Console](https://console.firebase.google.com/project/smis-mentor/storage) 접속
2. Storage → 파일 탭으로 이동
3. 각 파일/폴더의 권한 설정 확인

### 5. 서비스 계정 권한 확인

Firebase Console에서 서비스 계정에 필요한 권한이 있는지 확인:

1. [Google Cloud Console - IAM](https://console.cloud.google.com/iam-admin/iam?project=smis-mentor) 접속
2. `firebase-adminsdk-fbsvc@smis-mentor.iam.gserviceaccount.com` 서비스 계정 찾기
3. 다음 역할이 있는지 확인:
   - **Storage Object Admin** (저장소 객체 관리자)
   - **Firebase Rules Admin** (Firebase 규칙 관리자)

권한이 없다면 추가:
```
1. 서비스 계정 옆의 편집 버튼 클릭
2. "다른 역할 추가" 클릭
3. "Storage Object Admin" 검색 후 추가
4. "Firebase Rules Admin" 검색 후 추가
5. 저장
```

## Storage Rules 설명

현재 적용된 규칙:

```rules
// 프로필 이미지 - 인증된 사용자는 읽기/쓰기 가능
match /profileImages/{userId}/{allPaths=**} {
  allow read: if request.auth != null || resource.metadata.isPublic == true;
  allow write: if request.auth != null && request.auth.uid == userId;
  allow delete: if request.auth != null && request.auth.uid == userId;
}

// 레슨 자료 - 인증된 사용자는 읽기 가능, 관리자만 쓰기 가능
match /lessonMaterials/{allPaths=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && (role == 'admin' || role == 'manager');
  allow delete: if request.auth != null && (role == 'admin' || role == 'manager');
}
```

## CORS 설정 설명

`cors.json` 파일은 모든 origin에서 Storage에 접근할 수 있도록 설정:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "X-Requested-With"]
  }
]
```

**보안 강화를 원한다면** `origin`을 실제 도메인으로 제한:
```json
"origin": ["https://your-domain.com", "http://localhost:3000"]
```

## 문제 해결 체크리스트

- [ ] `serviceAccountKey.json` 파일이 프로젝트 루트에 존재
- [ ] Firebase Storage Rules가 배포됨
- [ ] CORS 설정이 적용됨
- [ ] 서비스 계정에 필요한 권한이 부여됨
- [ ] Firebase Console에서 파일이 정상적으로 보임
- [ ] 브라우저 개발자 도구의 Console과 Network 탭에서 오류 확인

## 추가 디버깅

### 브라우저 개발자 도구에서 확인
```javascript
// Console에서 실행
// Storage 참조 확인
console.log(storage);

// 이미지 URL 확인
const imageUrl = 'YOUR_IMAGE_URL';
fetch(imageUrl)
  .then(res => console.log('Success:', res))
  .catch(err => console.error('Error:', err));
```

### Firebase 로그 확인
```bash
# Firebase Functions 로그 확인 (있다면)
firebase functions:log

# Storage 사용량 확인
firebase use smis-mentor
firebase storage:get-usage
```

## 참고 자료

- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Firebase Storage CORS Configuration](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
- [Google Cloud IAM Roles](https://cloud.google.com/iam/docs/understanding-roles)

