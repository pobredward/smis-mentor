# ST 시트 동기화 시스템 가이드

## 개요

캠프 코드별로 다른 스프레드시트를 연동하여 학생 정보를 효율적으로 관리하는 시스템입니다.

## 캠프 코드별 스프레드시트 설정

### E27 캠프
- **Spreadsheet ID**: `1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8`
- **Sheet Name**: ST
- **GID**: 0
- **타입**: EJ (입소공항/퇴소공항 정보)
- **매핑 방식**: 헤더 이름 기반 동적 매핑

### J27 캠프
- **Spreadsheet ID**: `17tdhLYotT3IqkUCrUTXt9wjs5lB5pMAKKSSxtLQ3m6c`
- **Sheet Name**: ST
- **GID**: 0
- **타입**: EJ (입소공항/퇴소공항 정보)
- **매핑 방식**: 헤더 이름 기반 동적 매핑

### S27 캠프
- **Spreadsheet ID**: `1GQ9klMrYnv57nnbQ92LFYxBFig1EF9ewDe72obyjpC8`
- **Sheet Name**: ST
- **GID**: 296268666
- **타입**: S (단체티/여권정보)
- **매핑 방식**: 헤더 이름 기반 동적 매핑

**중요**: 
- 각 스프레드시트의 ST 시트는 고유한 `gid`를 가지고 있습니다. Google Sheets URL에서 `#gid=숫자` 부분을 확인하여 올바른 gid를 설정해야 합니다.
- 모든 캠프가 1행의 헤더 이름으로 데이터를 매핑합니다. 컬럼 순서가 바뀌어도 헤더 이름만 일치하면 자동으로 매핑됩니다.

## 동기화 프로세스

### 1. 관리자 수동 동기화
관리자가 모바일 앱에서 **"동기화" 버튼을 수동으로 클릭**할 때만 동기화가 실행됩니다:

1. 현재 활성화된 캠프 코드(`campCode`)를 확인
2. `CAMP_SHEET_CONFIG`에서 해당 캠프 코드의 스프레드시트 설정을 조회
3. 올바른 Spreadsheet ID와 gid로 Google Sheets에서 TSV 형식으로 데이터 export
4. **헤더 기반 동적 매핑**:
   - 1행의 헤더 이름(예: "고유번호", "학생 이름", "유닛"...)으로 각 컬럼 식별
   - 헤더 이름과 필드를 자동 매핑하여 데이터 추출
   - 컬럼 순서가 바뀌어도 헤더 이름만 일치하면 정상 작동
5. 데이터를 파싱하여 `STSheetStudent` 객체 배열로 변환
6. Firestore `stSheetCache/{campCode}` 문서에 캠프 코드별로 저장

**중요**: 
- ✅ 동기화는 **관리자가 수동으로 버튼을 클릭할 때만** 실행됩니다
- ✅ 마이페이지에서 캠프 참여 이력을 변경해도 동기화가 **실행되지 않습니다**
- ✅ 각 캠프 코드는 **해당 캠프의 스프레드시트**에서 데이터를 가져옵니다 (E27 ≠ J27 ≠ S27)
- ✅ 모든 캠프에서 **헤더 이름으로 자동 매핑**되므로 컬럼 순서 변경에 유연하게 대응
- ✅ 모든 캠프에서 **"유닛" 컬럼**만 사용합니다 ("유닛멘토" 컬럼은 없음)

### 2. 데이터 구조

Firestore에 저장되는 문서 구조:

```typescript
// stSheetCache/E27
{
  campCode: 'E27',
  data: STSheetStudent[],     // E27 스프레드시트의 학생 데이터
  lastSyncedAt: string,
  syncedBy: 'admin',
  syncedByName: '관리자 이름',
  version: number,
  totalStudents: number
}

// stSheetCache/J27
{
  campCode: 'J27',
  data: STSheetStudent[],     // J27 스프레드시트의 학생 데이터
  ...
}

// stSheetCache/S27
{
  campCode: 'S27',
  data: STSheetStudent[],     // S27 스프레드시트의 학생 데이터
  ...
}
```

### 3. 캠프 타입별 필드 차이

#### EJ 타입 (E27, J27)
표시되는 추가 정보:
- 입소공항 (`departureRoute`)
- 퇴소공항 (`arrivalRoute`)

#### S 타입 (S27)
표시되는 추가 정보:
- 단체티 사이즈 (`shirtSize`)
- 여권상 영문이름 (`passportName`)
- 여권 번호 (`passportNumber`)
- 여권 만료일자 (`passportExpiry`)
- 유닛 (`unit`)

## 학생 상세 정보 표시 형식

### E/J 캠프 (E27, J27)

```
캠프 정보
- 고유번호: [고유번호]
- 반 정보: [반번호] | [반이름]반 | [반멘토] 멘토
- 유닛 정보: [유닛] 유닛 | [호수]호

기본 정보
- 신상: [학생 이름] | [영어 닉네임] | [학년] | [성별]
- 주민등록번호: [주민등록번호]
- 도로명 주소: [도로명 주소]
- 세부 주소: [세부 주소]
- 입퇴소공항: [입소여정] 입소 | [퇴소여정] 퇴소

보호자 정보
- 대표 보호자: [부모님 연락처] | [부모님 성함]
- 대표 이메일: [이메일 주소]
- 기타 보호자: [기타 연락처] | [기타 연락처 성함]

상세 정보
- 복용약 & 알레르기: [복용약 & 알레르기]
- 특이사항: [특이사항]
- 기타: [기타]
```

### S 캠프 (S27)

```
캠프 정보
- 고유번호: [고유번호]
- 반 정보: [반번호] | [반이름]반 | [반멘토] 멘토
- 유닛 정보: [유닛] 유닛 | [호수]호

기본 정보
- 신상: [학생 이름] | [영어 닉네임] | [학년] | [성별]
- 주민등록번호: [주민등록번호]
- 도로명 주소: [도로명 주소]
- 세부 주소: [세부 주소]
- 단체티 사이즈: [단체티]
- 여권정보: [여권상 영문이름] | [여권 번호] | [여권 만료일자]

보호자 정보
- 대표 보호자: [부모님 연락처] | [부모님 성함]
- 대표 이메일: [이메일 주소]
- 기타 보호자: [기타 연락처] | [기타 연락처 성함]

상세 정보
- 복용약 & 알레르기: [복용약 & 알레르기]
- 특이사항: [특이사항]
- 기타: [기타]
```

## 코드 변경 사항

### 1. `packages/shared/src/types/student.ts`
- `CAMP_SHEET_CONFIG` 추가: 캠프 코드별 스프레드시트 설정
- `CampCode`, `CampType` 타입 추가
- `ST_SHEET_COLUMNS`에 추가 필드 정의
- `STSheetStudent` 인터페이스에 캠프별 선택적 필드 추가

### 2. `packages/mobile/src/services/stSheet.ts`
- `fetchGoogleSheetsData` 함수에 `campCode` 매개변수 추가
- 캠프 타입에 따라 다른 필드 매핑
- `getCampType` 메서드 추가

### 3. `packages/mobile/src/components/StudentDetailModal.tsx`
- `campType` prop 추가
- 캠프 타입별 조건부 렌더링 구현

### 4. `packages/mobile/src/components/StudentList.tsx`
- `campType` 상태 관리 추가
- `onCampTypeChange` 콜백 추가

### 5. `packages/mobile/src/screens/ClassScreen.tsx`, `RoomScreen.tsx`
- `campType` 상태 관리
- `StudentDetailModal`에 `campType` 전달

## 사용 방법

### 1. 새 캠프 추가
`packages/shared/src/types/student.ts`의 `CAMP_SHEET_CONFIG`에 새 캠프 정보 추가:

```typescript
export const CAMP_SHEET_CONFIG = {
  // 기존 캠프들...
  E28: {
    spreadsheetId: '스프레드시트_ID',
    sheetName: 'ST',
    gid: 'ST_시트의_gid', // Google Sheets URL에서 #gid=숫자 확인
    type: 'EJ' as const, // 또는 'S'
    useHeaderMapping: true, // 헤더 이름으로 동적 매핑 (권장)
  },
} as const;
```

**GID 찾는 방법**:
1. Google Sheets에서 ST 시트를 열기
2. 브라우저 URL 확인: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit#gid=[GID]`
3. `#gid=` 뒤의 숫자가 해당 시트의 gid입니다

**매핑 방식**:
- `useHeaderMapping: true`: 1행 헤더 이름으로 동적 매핑 (권장 - 컬럼 순서 변경에 유연)
- 모든 캠프는 동일한 헤더 이름을 사용해야 합니다

### 2. 동기화 실행
1. 모바일 앱에서 관리자 계정으로 로그인
2. 반 또는 방 탭에서 "동기화" 버튼 클릭
3. 현재 활성화된 캠프 코드의 스프레드시트 데이터가 자동으로 동기화됨

### 3. 학생 정보 조회
- 동기화된 데이터는 Firestore에 캐시되어 빠르게 조회 가능
- 캠프 타입에 따라 자동으로 다른 필드 표시

## 주의사항

1. **스프레드시트 공개 설정**: 모든 스프레드시트는 링크를 아는 사람만 볼 수 있도록 설정 필요
2. **컬럼 구조 일치**: 모든 캠프의 ST 시트는 동일한 컬럼 구조 사용
3. **정기 동기화**: 스프레드시트 변경 시 관리자가 수동으로 동기화 필요
4. **타입 안정성**: `CampCode` 타입에 정의된 캠프만 사용 가능

## 트러블슈팅

### 동기화 실패 시 (HTTP 400 에러)
1. **GID 확인**: 가장 흔한 원인은 잘못된 `gid`입니다
   - Google Sheets에서 ST 시트를 열고 URL의 `#gid=숫자` 확인
   - `CAMP_SHEET_CONFIG`의 `gid` 값이 일치하는지 확인
2. **스프레드시트 ID 확인**: Spreadsheet ID가 올바른지 확인
3. **스프레드시트 공개 설정**: 스프레드시트가 "링크가 있는 모든 사용자" 이상으로 공개되어 있는지 확인
4. **시트 이름 확인**: 시트 이름이 정확히 "ST"인지 확인 (대소문자 구분)

### S27 데이터가 잘못 표시될 때
1. **헤더 이름 확인**: 모든 캠프는 1행의 헤더 이름으로 매핑합니다
   - 필수 헤더: "고유번호", "학생 이름", "영어 닉네임", "학년", "성별", "부모님 연락처", "부모님 성함", "이메일 주소", "반번호", "반이름", "반멘토", "유닛", "호수" 등
   - **중요**: 모든 캠프에서 "유닛" 컬럼만 사용합니다 ("유닛멘토" 컬럼은 없음)
   - E/J 캠프 추가 헤더: "입소여정", "퇴소여정"
   - S 캠프 추가 헤더: "단체티", "여권상 영문이름", "여권 번호", "여권 만료일자"
2. **헤더 매핑 설정 확인**: 모든 캠프의 `useHeaderMapping`이 `true`인지 확인
3. **헤더 이름 정확성**: 헤더 이름이 정확히 일치해야 합니다 (공백, 띄어쓰기 주의)
4. **콘솔 로그 확인**: 동기화 시 콘솔에 출력되는 헤더 정보 확인

### 데이터가 표시되지 않을 때
1. Firestore `stSheetCache` 컬렉션에 해당 캠프 코드 문서가 있는지 확인
2. 캠프 코드가 올바르게 설정되었는지 확인
3. 동기화를 다시 실행
