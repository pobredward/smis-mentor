# ST시트 캠프 실무 기능 구현 가이드

## 📋 개요

구글 스프레드시트의 학생 데이터(ST시트)를 모바일 앱에서 조회하고 관리하는 시스템

## 🎯 핵심 기능

### 1. ST시트 동기화

**플로우:**
```
Google Sheets → Firebase Functions → Firestore 캐시 → Mobile App
```

**코드 예시:**

```typescript
// 동기화 버튼 클릭
const handleSync = async () => {
  const syncSTSheet = firebase.functions().httpsCallable('syncSTSheet');
  const result = await syncSTSheet({ campCode: 'E27', forceSync: true });
  console.log(`${result.data.totalStudents}명 동기화 완료`);
};
```

### 2. 멘토별 학생 조회

**요구사항:**
- 박현정 멘토가 로그인하면
- "반학생" 탭: BC열에 "박현정"인 학생만 표시
- "유닛학생" 탭: BD열에 "박현정"인 학생만 표시

**코드 예시:**

```typescript
const [tab, setTab] = useState<'class' | 'unit'>('class');
const { userData } = useAuth(); // { name: '박현정', role: 'mentor' }

const getStudents = firebase.functions().httpsCallable('getStudentsByMentor');
const result = await getStudents({
  campCode: 'E27',
  mentorName: userData.name,
  filterType: tab
});

// result.data.students = [
//   { name: '최민준', englishName: 'Minjun', classMentor: '박현정', ... },
//   { name: '송다은', englishName: 'Lua', classMentor: '박현정', ... },
//   ...
// ]
```

### 3. 학생 상세 정보 표시

**표시할 정보 (관리자가 설정 가능):**

```typescript
// 기본 정보
- 고유번호: E.001
- 이름: 최민준
- 영어 닉네임: Minjun
- 학년: G4
- 성별: 남

// 반 배정
- 반 번호: E03.10
- 반 이름: Grit
- 반 멘토: 박현정 ⭐️
- 유닛 멘토: 강경제 ⭐️
- 방 번호: 342

// 연락처
- 부모님: 전미경 (010-8932-5348)
- 기타: 최종환 (010-3931-2444)

// 건강 정보 (중요!)
- 복용약 & 알레르기: 없습니다
- 특이사항: 밥을 잘안먹고, 소심한 성격입니다...
```

## 🔐 권한 관리

```typescript
// Admin
- ✅ 모든 학생 조회
- ✅ ST시트 동기화
- ✅ 데이터 수정

// Mentor (박현정, 강준서 등)
- ❌ 전체 학생 조회 불가
- ✅ 본인 담당 학생만 조회 (반 or 유닛)
- ✅ ST시트 동기화 가능
- ❌ 데이터 수정 불가 (읽기 전용)

// User (일반 사용자)
- ❌ 모든 캠프 기능 접근 불가
```

## 📱 모바일 UI 구조

```
TabNavigator (5개 탭)
├─ Tab1: 홈
├─ Tab2: 채용
│   ├─ 공고
│   └─ 지원현황
├─ Tab3: 캠프 ⭐️
│   ├─ 교육 (1~4차)
│   ├─ 업무 (일일 업무)
│   ├─ 수업 (수업자료)
│   ├─ 반 ⭐️ [ST시트]
│   │   ├─ 동기화 버튼
│   │   ├─ 탭: 반학생 | 유닛학생
│   │   ├─ 학생 카드 리스트
│   │   └─ 학생 상세 모달
│   ├─ 방 (숙소 관리)
│   └─ 환자 (건강 관리)
├─ Tab4: 공지/소통
└─ Tab5: 마이페이지
```

## 🚀 구현 단계

### Phase 1: 백엔드 (완료 ✅)

- [x] Google Sheets API 서비스 구현
- [x] Firebase Functions 구현
- [x] Firestore 캐시 구조 설계
- [x] 권한 관리 시스템

### Phase 2: 모바일 기본 구조 (다음 단계)

- [ ] React Native 프로젝트 생성
- [ ] Firebase 연동
- [ ] Navigation 구조 (Bottom Tab + Stack)
- [ ] 인증 플로우

### Phase 3: ST시트 기능 (핵심)

- [ ] 동기화 화면 및 버튼
- [ ] 반/유닛 탭 구현
- [ ] 학생 카드 리스트 (FlatList)
- [ ] 학생 상세 모달
- [ ] Pull-to-Refresh
- [ ] 오프라인 캐시 (AsyncStorage)

### Phase 4: 추가 캠프 기능

- [ ] 교육 자료 화면
- [ ] 일일 업무 화면
- [ ] 수업 자료 업로드
- [ ] 방 배정 조회
- [ ] 환자 기록 작성

## 🧪 테스트 시나리오

### 시나리오 1: 멘토 로그인 및 학생 조회

```
1. 박현정 멘토가 로그인
2. 캠프 탭 → 반 메뉴 선택
3. "반학생" 탭 활성화 (기본)
4. 박현정이 담당하는 반학생 10명 표시
5. "유닛학생" 탭 클릭
6. 박현정이 담당하는 유닛학생 8명 표시
7. 학생 카드 클릭 → 상세 정보 모달 표시
```

### 시나리오 2: 동기화

```
1. "동기화" 버튼 클릭
2. 확인 다이얼로그 표시: "구글 시트에서 최신 데이터를 가져올까요?"
3. "동기화" 클릭
4. 로딩 인디케이터 표시 (10-20초)
5. Firebase Function 호출: syncSTSheet({ campCode: 'E27' })
6. 성공 토스트: "최신 데이터로 동기화되었습니다"
7. 학생 목록 자동 새로고침
```

### 시나리오 3: 오프라인 모드

```
1. 인터넷 연결 없음
2. 캠프 탭 → 반 메뉴
3. AsyncStorage에서 캐시된 데이터 로드
4. 마지막 동기화 시간 표시: "3시간 전"
5. 학생 목록 정상 표시 (읽기 전용)
6. 동기화 버튼 비활성화
```

## 📊 데이터 구조

### Firestore: stSheetCache/{campCode}

```typescript
{
  campCode: 'E27',
  data: [
    {
      studentId: 'E.001',
      name: '최민준',
      englishName: 'Minjun',
      grade: 'G4',
      gender: 'M',
      classMentor: '박현정',
      unitMentor: '강경제',
      roomNumber: '342',
      parentPhone: '010-8932-5348',
      parentName: '전미경',
      medication: '없습니다',
      notes: '밥을 잘안먹고...',
      classNumber: 'E03.10',
      className: 'Grit',
      rowNumber: 2,
      lastSyncedAt: Timestamp
    },
    // ... 99명 더
  ],
  lastSyncedAt: Timestamp,
  syncedBy: 'user123',
  syncedByName: '박현정',
  version: 5,
  totalStudents: 100
}
```

### AsyncStorage: st_sheet_{campCode}

```typescript
{
  data: [...], // 위와 동일
  lastSyncedAt: '2026-02-24T14:30:00.000Z'
}
```

## 🔧 유용한 명령어

```bash
# 전체 빌드
npm run build:shared
npm run build:functions

# Functions 배포
npm run deploy:functions

# Functions 로컬 테스트
cd functions
npm run serve

# 웹 개발 서버
npm run dev:web

# 로그 확인
firebase functions:log
```

## 📚 참고 자료

- **스프레드시트**: https://docs.google.com/spreadsheets/d/1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8
- **서비스 계정**: managesheet-export@managesheet-export.iam.gserviceaccount.com
- **Firebase 프로젝트**: smis-mentor
- **Functions 리전**: asia-northeast3 (서울)
