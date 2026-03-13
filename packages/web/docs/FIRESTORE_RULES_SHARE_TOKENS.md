# Firestore 보안 규칙 업데이트 가이드

## shareTokens 컬렉션 보안 규칙

지원자 정보 공유 링크 기능을 위해 `shareTokens` 컬렉션에 대한 Firestore 보안 규칙을 추가해야 합니다.

### 권장 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 기존 규칙들...
    
    // shareTokens 컬렉션
    match /shareTokens/{tokenId} {
      // 관리자만 생성 가능
      allow create: if request.auth != null && 
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      
      // 관리자만 읽기 가능 (목록 조회 용도)
      allow read: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      
      // 관리자만 업데이트 가능 (조기 비활성화 용도)
      allow update: if request.auth != null && 
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      
      // 삭제 금지 (히스토리 보존)
      allow delete: if false;
    }
  }
}
```

### 설명

1. **생성 (create)**: 
   - 인증된 사용자만 가능
   - 해당 사용자의 role이 'admin'인 경우에만 허용
   - 실제로는 서버 측 API를 통해 생성되므로 추가 검증이 필요 없음

2. **읽기 (read)**:
   - 관리자만 토큰 목록을 직접 조회 가능
   - 공개 API는 서버 측에서 처리하므로 클라이언트 직접 접근 불필요

3. **업데이트 (update)**:
   - 관리자만 토큰 상태 변경 가능
   - 주로 조기 비활성화 기능에 사용

4. **삭제 (delete)**:
   - 삭제 금지 (감사 로그 목적)
   - 만료된 토큰은 isActive: false로 표시

### 적용 방법

#### 방법 1: Firebase Console
1. Firebase Console 접속
2. Firestore Database > 규칙 탭
3. 위 규칙을 기존 규칙에 추가
4. "게시" 버튼 클릭

#### 방법 2: Firebase CLI
1. `firestore.rules` 파일 편집
2. 위 규칙 추가
3. 명령어 실행:
   ```bash
   firebase deploy --only firestore:rules
   ```

### 주의사항

- **서버 측 검증**: 보안 규칙과 별개로 API 레벨에서도 권한을 검증합니다.
- **토큰 기반 접근**: 공개 페이지는 토큰을 통해 API로 데이터를 가져오므로, Firestore 직접 접근이 필요하지 않습니다.
- **Admin SDK**: 서버 측 API는 Admin SDK를 사용하면 보안 규칙을 우회할 수 있습니다 (현재는 클라이언트 SDK 사용).

### 테스트

Firebase Console의 규칙 탭에서 "규칙 실행 시뮬레이터"를 사용하여 규칙을 테스트할 수 있습니다:

```javascript
// 테스트 시나리오 1: 관리자가 토큰 생성
match /shareTokens/test-token-id
operation: create
authenticated: yes
auth.uid: test-admin-uid

// 테스트 시나리오 2: 일반 사용자가 토큰 읽기 시도
match /shareTokens/test-token-id
operation: read
authenticated: yes
auth.uid: test-user-uid
// 결과: 거부됨

// 테스트 시나리오 3: 인증되지 않은 사용자의 접근
match /shareTokens/test-token-id
operation: read
authenticated: no
// 결과: 거부됨
```

### 보안 고려사항

1. **토큰 노출 방지**: shareTokens 컬렉션은 직접 접근이 차단되므로, 토큰 목록이 외부에 노출되지 않습니다.
2. **API를 통한 접근**: 공개 페이지는 API를 통해서만 데이터를 가져오며, 서버 측에서 만료 및 활성화 상태를 검증합니다.
3. **감사 로그**: 모든 토큰은 삭제되지 않고 비활성화만 되므로, 누가 언제 어떤 정보를 공유했는지 추적 가능합니다.
