# 🚀 빠른 해결 방법

Firebase Storage 미리보기 및 이미지 표시 문제를 해결하는 가장 빠른 방법입니다.

## 🔧 즉시 해결 (Firebase Console 사용)

### 1. Storage Rules를 Public으로 임시 변경 (테스트용)

1. [Firebase Console - Storage](https://console.firebase.google.com/project/smis-mentor/storage/smis-mentor.firebasestorage.app/rules) 접속
2. **Rules** 탭 클릭
3. 다음 규칙으로 변경:

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;  // 모든 사람이 읽기 가능
      allow write: if request.auth != null;  // 인증된 사용자만 쓰기 가능
    }
  }
}
```

4. **게시** 버튼 클릭

⚠️ **주의**: 이 방법은 테스트용입니다. 프로덕션에서는 적절한 보안 규칙을 사용하세요.

### 2. 서비스 계정 권한 추가

1. [Google Cloud Console - IAM](https://console.cloud.google.com/iam-admin/iam?project=smis-mentor) 접속
2. `firebase-adminsdk-fbsvc@smis-mentor.iam.gserviceaccount.com` 찾기
3. 연필 아이콘(편집) 클릭
4. **다른 역할 추가** 클릭
5. 다음 역할들을 추가:
   - `Storage Object Admin`
   - `Storage Admin`
6. **저장** 클릭
7. 5-10분 정도 기다린 후 다시 시도

## 📋 체크리스트

- [ ] Storage Rules 업데이트 완료
- [ ] 서비스 계정에 권한 추가 완료
- [ ] 5-10분 대기 (권한 전파 시간)
- [ ] 브라우저 캐시 삭제 (Cmd+Shift+R / Ctrl+Shift+R)
- [ ] 이미지가 정상적으로 표시되는지 확인

## 🔍 여전히 작동하지 않는다면?

### 방법 1: 브라우저 개발자 도구 확인

1. 페이지에서 F12 또는 Cmd+Option+I (Mac) 눌러 개발자 도구 열기
2. **Console** 탭에서 에러 메시지 확인
3. **Network** 탭에서 이미지 요청 상태 확인

### 방법 2: 파일 메타데이터 확인

Firebase Console에서 이미지 파일 클릭 → **기타 메타데이터** 확인:
- `Content-Type`이 `image/jpeg` 또는 `image/png`인지 확인
- 필요하다면 수동으로 추가

### 방법 3: URL 직접 테스트

```javascript
// 브라우저 Console에서 실행
const testUrl = 'YOUR_IMAGE_URL_HERE';
fetch(testUrl)
  .then(res => {
    if (res.ok) {
      console.log('✅ 이미지 접근 가능!', res);
    } else {
      console.error('❌ 이미지 접근 불가:', res.status, res.statusText);
    }
  })
  .catch(err => console.error('❌ 네트워크 오류:', err));
```

## 🎯 권장 보안 규칙 (프로덕션용)

테스트가 완료되면 다음 규칙으로 변경하세요:

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // 프로필 이미지 - 모든 사용자 읽기 가능, 본인만 수정 가능
    match /profileImages/{userId}/{allPaths=**} {
      allow read: if true;
      allow write, delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // 레슨 자료 - 인증된 사용자만 읽기 가능, 관리자만 수정 가능
    match /lessonMaterials/{allPaths=**} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager'];
    }
    
    // 기타 파일 - 인증된 사용자만 접근 가능
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 💡 추가 팁

1. **캐시 문제**: 이미지 URL에 쿼리 파라미터 추가
   ```typescript
   const imageUrl = `${url}?t=${Date.now()}`;
   ```

2. **토큰 문제**: Firebase Storage getDownloadURL() 사용
   ```typescript
   import { ref, getDownloadURL } from 'firebase/storage';
   import { storage } from '@/lib/firebase';
   
   const imageRef = ref(storage, 'profileImages/userId/image.jpg');
   const url = await getDownloadURL(imageRef);
   ```

3. **CORS 문제**: 명령줄에서 CORS 설정
   ```bash
   gsutil cors set cors.json gs://smis-mentor.firebasestorage.app
   ```

## 📞 지원

문제가 계속되면 다음 정보와 함께 문의하세요:
- 브라우저 Console의 에러 메시지
- Network 탭의 요청/응답 상태
- 이미지 URL 예시
- Storage Rules 설정

