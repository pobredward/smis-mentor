# 사용자 조회 페이지 UI 개선 완료

## 📋 수정 사항

### ✅ Web과 동일한 프로필 사진 그리드 형태로 변경

**파일**: `/packages/mobile/src/screens/UserCheckScreen.tsx`

### 변경 전
- 사용자 정보를 카드 리스트 형태로 표시
- 이름, 이메일, 전화번호, 역할 텍스트 정보만 표시
- 프로필 사진 미표시
- 공간 활용 비효율적

### 변경 후
- ✅ Web과 동일한 프로필 사진 그리드 형태
- ✅ 한 행에 최대 3명씩 표시 (모바일 최적화)
- ✅ 프로필 사진, groupRole, classCode 배지 표시
- ✅ 그룹별 묶어서 표시 (매니저, 공통, 주니어, 미들, 시니어 등)
- ✅ classCode 오름차순 정렬
- ✅ 터치하면 상세 정보 모달

---

## 🔧 구현 상세

### 1. Import 추가
```typescript
import { Image, Modal } from 'react-native';
```

### 2. 인터페이스 확장
```typescript
interface UserWithGroupInfo {
  // ... 기존 필드
  profileImage?: string;    // 추가
  groupRole?: string;       // 추가
  classCode?: string;       // 추가
}
```

### 3. 상태 추가
```typescript
const [selectedUser, setSelectedUser] = useState<UserWithGroupInfo | null>(null);
```

### 4. 사용자 로드 로직 개선
```typescript
const enrichedUsers = usersData.map((user: any) => {
  let jobGroup = 'junior';
  let groupRole = '';
  let classCode = '';

  if (user.jobExperiences && user.jobExperiences.length > 0) {
    const jobCode = jobCodes.find(
      (code) => code.generation === selectedGeneration && code.code === selectedCode
    );

    const relevantExperience = user.jobExperiences.find(
      (exp: any) => jobCode && exp.id === jobCode.id
    );

    if (relevantExperience) {
      if ('group' in relevantExperience) jobGroup = relevantExperience.group;
      if ('groupRole' in relevantExperience) groupRole = relevantExperience.groupRole;
      if ('classCode' in relevantExperience) classCode = relevantExperience.classCode;
    }
  }

  return {
    ...user,
    groupName: jobGroup,
    groupRole,
    classCode,
  };
});
```

### 5. 정렬 로직 추가
```typescript
// classCode 오름차순, 없으면 맨 뒤, 이름순 2차
usersInGroup = [...usersInGroup].sort((a, b) => {
  const classCodeA = a.classCode;
  const classCodeB = b.classCode;
  if (classCodeA && classCodeB) {
    if (classCodeA < classCodeB) return -1;
    if (classCodeA > classCodeB) return 1;
    return (a.name || '').localeCompare(b.name || '');
  }
  if (classCodeA && !classCodeB) return -1;
  if (!classCodeA && classCodeB) return 1;
  return (a.name || '').localeCompare(b.name || '');
});
```

---

## 🎨 UI 구현

### 1. 그룹 헤더
```typescript
<View style={styles.groupHeader}>
  <Text style={styles.groupHeaderText}>
    {groupLabels[group] || group}
  </Text>
  <Text style={styles.groupCountBadge}>
    {usersInGroup.length}명
  </Text>
</View>
```

### 2. 프로필 그리드 (한 행에 3명)
```typescript
<View style={styles.userGrid}>  // flexDirection: row, flexWrap: wrap
  {usersInGroup.map((user) => (
    <TouchableOpacity
      style={styles.userGridItem}  // width: 31.5%
      onPress={() => setSelectedUser(user)}
    >
      {/* 프로필 이미지 */}
      <View style={styles.profileImageContainer}>
        {user.profileImage ? (
          <Image source={{ uri: user.profileImage }} style={styles.profileImage} />
        ) : (
          <View style={styles.profilePlaceholder}>
            <Text style={styles.profilePlaceholderText}>
              {user.name.charAt(0)}
            </Text>
          </View>
        )}
        
        {/* 배지 (groupRole, classCode) */}
        <View style={styles.badgeContainer}>
          {user.groupRole && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{user.groupRole}</Text>
            </View>
          )}
          {user.classCode && (
            <View style={[styles.badge, styles.badgeBlue]}>
              <Text style={styles.badgeText}>{user.classCode}</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* 이름 */}
      <Text style={styles.userGridName}>{user.name}</Text>
    </TouchableOpacity>
  ))}
</View>
```

### 3. 사용자 상세 모달
```typescript
<Modal visible={true} animationType="slide" transparent={true}>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      <ScrollView>
        {/* 헤더: 프로필 사진, 이름, 전화번호, 그룹 배지 */}
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderLeft}>
            {/* 프로필 이미지 (64x64) */}
            <View style={styles.modalUserInfo}>
              <Text style={styles.modalUserName}>{selectedUser.name}</Text>
              <Text style={styles.modalUserPhone}>{phone}</Text>
              <View style={styles.modalGroupBadge}>
                <Text>{groupLabel}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={() => setSelectedUser(null)}>
            <Ionicons name="close" />
          </TouchableOpacity>
        </View>

        {/* 기본 정보 */}
        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>기본 정보</Text>
          {/* 이메일, 역할, 상태 */}
        </View>

        {/* 업무 경력 */}
        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>업무 경력</Text>
          {/* 기수, 코드, groupRole, classCode */}
        </View>
      </ScrollView>

      {/* 닫기 버튼 */}
      <TouchableOpacity onPress={() => setSelectedUser(null)}>
        <Text>닫기</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

---

## 🎨 주요 스타일

### 그리드 레이아웃
```typescript
userGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},
userGridItem: {
  width: '31.5%',  // 한 행에 3명 (100% / 3 ≈ 31.5% + gap)
  marginBottom: 8,
}
```

### 프로필 이미지
```typescript
profileImageContainer: {
  position: 'relative',
  width: '100%',
  aspectRatio: 1,  // 정사각형
  borderRadius: 8,
  overflow: 'hidden',
  backgroundColor: '#f3f4f6',
}
```

### 배지
```typescript
badgeContainer: {
  position: 'absolute',
  top: 4,
  right: 4,
  gap: 4,
},
badge: {
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 12,
  backgroundColor: '#E5E7EB',
  borderWidth: 1,
  borderColor: '#D1D5DB',
},
badgeText: {
  fontSize: 9,
  fontWeight: '600',
  color: '#374151',
}
```

### 모달
```typescript
modalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 20,
},
modalContent: {
  backgroundColor: '#fff',
  borderRadius: 16,
  width: '100%',
  maxHeight: '80%',
  padding: 20,
}
```

---

## 🔄 Web과 비교

### Web (grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6)
```html
<!-- 모바일: 3개, 데스크탑: 6개 -->
<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
  <div className="aspect-square w-full bg-gray-200 relative">
    <img src={user.profileImage} />
    <div className="absolute top-1 right-1 flex gap-1">
      <span>{groupRole}</span>
      <span>{classCode}</span>
    </div>
  </div>
  <h3>{user.name}</h3>
</div>
```

### Mobile (flexDirection: row, flexWrap: wrap, width: 31.5%)
```typescript
// 모바일: 3개 (고정)
<View style={styles.userGrid}>
  <TouchableOpacity style={styles.userGridItem}>  // width: 31.5%
    <View style={styles.profileImageContainer}>  // aspectRatio: 1
      <Image source={{ uri: user.profileImage }} />
      <View style={styles.badgeContainer}>  // position: absolute, top: 4, right: 4
        <View style={styles.badge}>
          <Text>{groupRole}</Text>
        </View>
        <View style={styles.badge}>
          <Text>{classCode}</Text>
        </View>
      </View>
    </View>
    <Text>{user.name}</Text>
  </TouchableOpacity>
</View>
```

**공통점**:
- 정사각형 프로필 이미지 (aspectRatio: 1 / aspect-square)
- 우측 상단에 배지 (position: absolute)
- 이름 하단 표시
- 그룹별 분류 및 정렬

**차이점**:
- Web: 반응형 (3~6개), Mobile: 고정 3개
- Web: Tailwind CSS, Mobile: StyleSheet
- Web: 클릭 시 모달 (고정 위치), Mobile: 모달 (중앙)

---

## 📱 사용자 경험

### 변경 전
```
┌─────────────────────────────────────┐
│  홍길동                             │
│  hong@example.com                  │
│  010-1234-5678                     │
│  역할: 사용자                       │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  김철수                             │
│  kim@example.com                   │
│  010-2345-6789                     │
│  역할: 사용자                       │
└─────────────────────────────────────┘
```

### 변경 후
```
┌────────┬────────┬────────┐
│ [사진] │ [사진] │ [사진] │
│ 홍길동 │ 김철수 │ 이영희 │
└────────┴────────┴────────┘
┌────────┬────────┬────────┐
│ [사진] │ [사진] │ [사진] │
│ 박민수 │ 정지원 │ 최준호 │
└────────┴────────┴────────┘
```

**개선 효과**:
1. **시각적 정보 증가**: 프로필 사진으로 사용자 식별 용이
2. **공간 활용 향상**: 같은 공간에 3배 많은 사용자 표시
3. **그룹 구분 명확**: 그룹별로 묶어서 표시
4. **배지 정보**: groupRole, classCode 한눈에 확인
5. **직관적 네비게이션**: 터치하면 상세 정보

---

## ✅ 기능 체크리스트

- [x] 프로필 사진 그리드 표시
- [x] 한 행에 3명씩 배치
- [x] groupRole 배지 표시
- [x] classCode 배지 표시
- [x] 그룹별 분류 (매니저, 주니어 등)
- [x] classCode 오름차순 정렬
- [x] 이름 2차 정렬
- [x] 터치 시 상세 모달
- [x] 모달에 기본 정보 표시
- [x] 모달에 업무 경력 표시
- [x] Web과 유사한 UI/UX

---

## 🎯 결과

### 변경 전
- ❌ 텍스트 정보만 표시
- ❌ 프로필 사진 미표시
- ❌ 카드 형태로 공간 낭비
- ❌ 한 화면에 2-3명만 표시
- ❌ 배지 정보 미표시

### 변경 후
- ✅ 프로필 사진 그리드
- ✅ 한 행에 3명씩 표시
- ✅ 공간 효율적 활용
- ✅ 한 화면에 9명 이상 표시
- ✅ groupRole, classCode 배지 표시
- ✅ Web과 동일한 UX
- ✅ 터치 시 상세 정보 모달

---

## 📊 비교 표

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 레이아웃 | 카드 리스트 | 프로필 그리드 |
| 한 행 표시 | 1명 | 3명 |
| 프로필 사진 | ❌ | ✅ |
| 배지 (groupRole) | ❌ | ✅ |
| 배지 (classCode) | ❌ | ✅ |
| 그룹별 분류 | ✅ | ✅ |
| 정렬 | 이름순만 | classCode + 이름순 |
| 상세 정보 | 카드에 표시 | 모달로 표시 |
| 공간 효율 | 낮음 | 높음 |
| Web 유사도 | 낮음 | 높음 |

---

## 🚀 추가 개선 사항 (선택)

1. **검색 기능**:
   - 이름, 이메일 검색
   - 실시간 필터링

2. **프로필 이미지 확대**:
   - 프로필 이미지 터치 시 전체 화면 뷰

3. **정렬 옵션**:
   - 이름순, classCode순, 최근 활동순

4. **필터링**:
   - 역할별 필터 (관리자, 멘토, 사용자)
   - 상태별 필터 (활성, 비활성)

5. **캐싱**:
   - 프로필 이미지 로컬 캐싱
   - 사용자 목록 캐싱

6. **애니메이션**:
   - 그리드 아이템 페이드인
   - 모달 슬라이드 애니메이션

---

## 🎉 결론

사용자 조회 페이지가 Web과 동일한 프로필 그리드 형태로 변경되어:

1. **시각적 개선**: 프로필 사진으로 사용자 식별 용이
2. **공간 효율**: 한 행에 3명씩 표시로 화면 활용도 3배 향상
3. **정보 밀도**: groupRole, classCode 배지로 더 많은 정보 제공
4. **사용자 경험**: Web과 동일한 직관적인 UX
5. **모바일 최적화**: 터치 친화적인 그리드 레이아웃

이제 Mobile에서도 Web처럼 효율적으로 사용자를 조회할 수 있습니다! 🚀
