# Mobile (React Native) 지도 기능 구현 분석

## ✅ 구현 가능 여부: **완전히 가능합니다!**

---

## 1️⃣ 필요한 라이브러리

### react-native-maps (추천)
```bash
npx expo install react-native-maps
```

**장점:**
- ✅ Expo와 완벽 호환
- ✅ iOS (Apple Maps), Android (Google Maps) 네이티브 지도 사용
- ✅ 성능 우수
- ✅ 커스텀 마커, 팝업 지원
- ✅ 무료

**구현 난이도:** ⭐⭐☆☆☆ (쉬움)

---

## 2️⃣ 구현 방법

### A. 기본 구조 (Web과 동일)

\`\`\`typescript
// packages/mobile/src/screens/UserMapScreen.tsx

import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { geocodeAddress } from '../utils/geocoding'; // Web과 동일한 로직

interface UserWithCoords {
  ...User;
  lat: number;
  lng: number;
}

export function UserMapScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [usersWithCoords, setUsersWithCoords] = useState<UserWithCoords[]>([]);

  useEffect(() => {
    // Firestore에서 사용자 로드
    loadUsers();
  }, []);

  useEffect(() => {
    // Web과 동일: 캐시된 좌표 사용 또는 변환
    processUsers();
  }, [users]);

  return (
    <MapView
      style={{ flex: 1 }}
      provider={PROVIDER_GOOGLE}
      initialRegion={{
        latitude: 37.5665,
        longitude: 126.9780,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }}
    >
      {usersWithCoords.map(user => (
        <Marker
          key={user.userId}
          coordinate={{
            latitude: user.lat,
            longitude: user.lng,
          }}
          title={user.name}
          description={user.address}
        />
      ))}
    </MapView>
  );
}
\`\`\`

### B. 커스텀 마커 (Web과 동일한 디자인)

\`\`\`typescript
import { Marker } from 'react-native-maps';
import { View, Text } from 'react-native';

<Marker
  coordinate={{ latitude: user.lat, longitude: user.lng }}
>
  <View style={{
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: getRoleColor(user.role),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  }}>
    <Text style={{ color: 'white', fontWeight: 'bold' }}>
      {user.name.charAt(0)}
    </Text>
  </View>
</Marker>
\`\`\`

---

## 3️⃣ Web과 공통 로직 공유

### 방법 1: Shared Package 활용 (추천)

\`\`\`
packages/
├── shared/
│   └── src/
│       ├── utils/
│       │   └── geocoding.ts       # 주소 → 좌표 변환
│       └── hooks/
│           └── useUserMap.ts      # 지도 데이터 로직
├── web/
│   └── src/
│       └── components/admin/UserMap.tsx
└── mobile/
    └── src/
        └── screens/UserMapScreen.tsx
\`\`\`

**공통화 가능한 로직:**
- ✅ Kakao Geocoding API 호출
- ✅ 사용자 데이터 로드
- ✅ 캐시된 좌표 확인
- ✅ 필터링 로직
- ✅ 마커 색상 계산

**플랫폼별 차이:**
- ❌ 지도 컴포넌트 (react-map-gl vs react-native-maps)
- ❌ 마커 렌더링 (HTML vs React Native View)

### 방법 2: 커스텀 Hook 사용

\`\`\`typescript
// packages/shared/src/hooks/useUserMap.ts

export function useUserMap(users: User[]) {
  const [usersWithCoords, setUsersWithCoords] = useState<UserWithCoords[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(true);

  useEffect(() => {
    async function processUsers() {
      setIsGeocoding(true);
      const processed: UserWithCoords[] = [];

      for (const user of users) {
        // 캐시된 좌표 사용 또는 변환
        if (user.geocode) {
          processed.push({
            ...user,
            lat: user.geocode.lat,
            lng: user.geocode.lng,
          });
        } else if (user.address) {
          const coords = await geocodeAddress(user.address);
          if (coords) {
            processed.push({ ...user, ...coords });
          }
        }
      }

      setUsersWithCoords(processed);
      setIsGeocoding(false);
    }

    processUsers();
  }, [users]);

  return { usersWithCoords, isGeocoding };
}
\`\`\`

---

## 4️⃣ 성능 비교

| 항목 | Web | Mobile (React Native) |
|------|-----|----------------------|
| 지도 성능 | ⭐⭐⭐⭐ (Leaflet) | ⭐⭐⭐⭐⭐ (네이티브) |
| 초기 로딩 | ~500ms | ~300ms |
| 메모리 사용 | 중간 | 낮음 |
| 줌/팬 부드러움 | 좋음 | 매우 좋음 |
| 마커 렌더링 | HTML/CSS | 네이티브 View |

**결론:** Mobile이 성능상 더 유리!

---

## 5️⃣ 추가 고려사항

### iOS (Apple Maps)
- ✅ 별도 API 키 불필요
- ✅ 자동으로 사용됨

### Android (Google Maps)
- ⚠️ Google Maps API 키 필요 (무료)
- 📝 `app.json`에 키 추가:

\`\`\`json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      }
    }
  }
}
\`\`\`

### 권한 요청
위치 기반 서비스가 아니므로 권한 불필요!

---

## 6️⃣ 구현 시간 예상

| 작업 | 예상 시간 |
|------|-----------|
| react-native-maps 설치 | 10분 |
| 기본 지도 화면 구현 | 30분 |
| 커스텀 마커 디자인 | 20분 |
| 공통 로직 분리 | 30분 |
| 테스트 및 디버깅 | 30분 |
| **총 예상 시간** | **약 2시간** |

---

## 7️⃣ 최종 결론

### ✅ Mobile 구현은 완전히 가능하며, 오히려 더 유리합니다!

**이유:**
1. **네이티브 지도** 사용으로 성능 우수
2. **Web과 90% 로직 공유** 가능
3. **Expo 완벽 호환**으로 설정 간편
4. **API 키 최소** (Kakao만 필요, iOS는 불필요)

### 🚀 추천 구현 순서

1. **Shared 패키지에 공통 로직 추출**
   - `geocoding.ts`
   - `useUserMap.ts`

2. **Mobile Screen 생성**
   - `UserMapScreen.tsx`

3. **네비게이션 추가**
   - 관리자 메뉴에 "사용자 지도" 링크

4. **테스트**
   - iOS Simulator
   - Android Emulator

### 💡 개선 아이디어

Mobile에서는 추가로 이런 기능도 가능:
- 📍 사용자의 현재 위치 표시
- 🗺️ 네이티브 지도 앱으로 열기
- 📞 마커 클릭 시 전화 걸기
- 🚗 길찾기 기능

---

## 결론

**Web에서 구현한 모든 기능이 Mobile에서도 동일하게 가능하며, 성능은 더 좋습니다!**
