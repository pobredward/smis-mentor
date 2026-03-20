# 소셜 로그인 구현 계획

## 📋 개요

기존 4단계 회원가입 플로우를 유지하면서 소셜 로그인을 통합합니다.
소셜 로그인 사용 시 **Step 2 (이메일/비밀번호)를 자동으로 건너뛰고**, 나머지 단계는 그대로 진행합니다.

## 🎯 핵심 아이디어

### 일반 회원가입 플로우
```
Step 1: 개인정보 (이름, 전화번호) → temp 계정 검색
Step 2: 이메일/비밀번호
Step 3: 교육정보 (대학, 학년, 전공)
Step 4: 직무정보/자기소개
```

### 소셜 로그인 회원가입 플로우
```
소셜 로그인 → Step 1: 개인정보 → [Step 2 SKIP] → Step 3: 교육정보 → Step 4: 직무정보
```

## 📱 UI 변경사항

### 1. SignInScreen (로그인 화면)

**추가 요소:**
- Google 로그인 버튼
- Apple 로그인 버튼 (iOS only)
- 구분선 ("또는")

```
┌─────────────────────────┐
│     SMIS 로고           │
├─────────────────────────┤
│ 이메일 입력             │
│ 비밀번호 입력           │
│ [로그인 버튼]           │
│                         │
│ ─────── 또는 ──────     │
│                         │
│ [🔵 Google로 계속하기]  │
│ [🍎 Apple로 계속하기]   │  ← iOS만
│                         │
│ 회원가입                │
└─────────────────────────┘
```

### 2. SignUpStep1Screen 수정

**기능 추가:**
- `isSocialSignUp` prop 추가
- 소셜 로그인 데이터 수신
- 이름 자동 입력 (소셜에서 받은 이름)

### 3. SignUpStep2Screen 조건부 렌더링

**로직:**
```typescript
// App.tsx 또는 회원가입 플로우에서
if (isSocialSignUp) {
  // Step 2 건너뛰기
  goToStep3();
} else {
  // Step 2 표시
  renderStep2();
}
```

## 🔧 구현 단계

### Phase 1: 기본 구조 준비

#### 1.1 타입 정의
```typescript
// types/index.ts

export interface SocialUserData {
  email: string;
  name: string;
  photoURL?: string;
  providerId: 'google.com' | 'apple.com';
  providerUid: string;
  idToken?: string;
  accessToken?: string;
}

export interface AuthProvider {
  providerId: 'google.com' | 'apple.com' | 'password';
  uid: string;
  email?: string;
  linkedAt: Timestamp;
  displayName?: string;
  photoURL?: string;
}

export interface User {
  // ... 기존 필드들
  
  // 추가 필드
  authProviders?: AuthProvider[];
  primaryAuthMethod?: 'email' | 'social';
}

export interface SignUpState {
  // Step 1
  name: string;
  phone: string;
  
  // Step 2 (소셜 로그인 시 생략)
  email?: string;
  password?: string;
  
  // Step 3
  university?: string;
  grade?: number;
  isOnLeave?: boolean;
  major1?: string;
  major2?: string;
  
  // 소셜 로그인 관련
  isSocialSignUp?: boolean;
  socialData?: SocialUserData;
  tempUserId?: string; // temp 계정 연동 시
}
```

#### 1.2 소셜 인증 서비스 생성

**파일:** `packages/mobile/src/services/socialAuthService.ts`

```typescript
import { 
  GoogleAuthProvider, 
  signInWithCredential,
  linkWithCredential,
  OAuthProvider 
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { getUserByEmail, getUserByPhone } from './authService';

// Google 로그인
export async function signInWithGoogle(): Promise<SocialUserData> {
  // Expo Google Sign In 사용
  // 구현은 Phase 2에서
}

// Apple 로그인 (iOS)
export async function signInWithApple(): Promise<SocialUserData> {
  // Expo Apple Authentication 사용
  // 구현은 Phase 2에서
}

// 소셜 로그인 메인 플로우
export async function handleSocialLogin(
  socialData: SocialUserData
): Promise<{
  action: 'LOGIN' | 'SIGNUP' | 'LINK_ACTIVE';
  user?: User;
  requiresPhone?: boolean;
}> {
  // 1. 이메일로 기존 계정 확인
  const existingUser = await getUserByEmail(socialData.email);
  
  if (existingUser) {
    if (existingUser.status === 'active') {
      // 기존 active 계정 → 소셜 연동 후 로그인
      await linkSocialProvider(existingUser.userId, socialData);
      return { action: 'LOGIN', user: existingUser };
    }
    // temp 계정은 이메일이 없으므로 여기 올 수 없음
  }
  
  // 2. 신규 회원가입 필요
  return { action: 'SIGNUP', requiresPhone: true };
}

// 전화번호로 temp 계정 확인
export async function checkTempAccountByPhone(
  phone: string,
  socialData: SocialUserData
): Promise<{
  found: boolean;
  user?: User;
  nameMatches?: boolean;
}> {
  const user = await getUserByPhone(phone);
  
  if (!user) {
    return { found: false };
  }
  
  if (user.status === 'active') {
    throw new Error('ALREADY_REGISTERED');
  }
  
  // temp 계정 발견
  return {
    found: true,
    user,
    nameMatches: user.name === socialData.name,
  };
}

// temp 계정을 소셜 계정으로 활성화
export async function activateTempAccountWithSocial(
  tempUserId: string,
  socialData: SocialUserData,
  additionalData: Partial<User>
): Promise<void> {
  const { updateUser } = await import('./authService');
  
  await updateUser(tempUserId, {
    email: socialData.email,
    profileImage: socialData.photoURL,
    status: 'active',
    authProviders: [{
      providerId: socialData.providerId,
      uid: socialData.providerUid,
      email: socialData.email,
      linkedAt: Timestamp.now(),
    }],
    primaryAuthMethod: 'social',
    ...additionalData,
  });
}

// 기존 계정에 소셜 제공자 연동
async function linkSocialProvider(
  userId: string,
  socialData: SocialUserData
): Promise<void> {
  const { getUserById, updateUser } = await import('./authService');
  const user = await getUserById(userId);
  
  const existingProviders = user.authProviders || [];
  const alreadyLinked = existingProviders.some(
    p => p.providerId === socialData.providerId
  );
  
  if (!alreadyLinked) {
    await updateUser(userId, {
      authProviders: [
        ...existingProviders,
        {
          providerId: socialData.providerId,
          uid: socialData.providerUid,
          email: socialData.email,
          linkedAt: Timestamp.now(),
        }
      ],
    });
  }
}

// 기존 active 계정에 소셜 연결 (비밀번호 재확인 필요)
export async function linkSocialToExistingAccount(
  email: string,
  password: string,
  socialData: SocialUserData
): Promise<void> {
  const { signIn, getUserByEmail } = await import('./authService');
  
  // 1. 기존 계정으로 로그인
  await signIn(email, password);
  
  // 2. Firebase Auth에 소셜 제공자 연결
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('로그인이 필요합니다');
  }
  
  let credential;
  if (socialData.providerId === 'google.com') {
    credential = GoogleAuthProvider.credential(
      socialData.idToken,
      socialData.accessToken
    );
  } else if (socialData.providerId === 'apple.com') {
    credential = new OAuthProvider('apple.com').credential({
      idToken: socialData.idToken,
    });
  }
  
  if (credential) {
    await linkWithCredential(currentUser, credential);
  }
  
  // 3. Firestore 업데이트
  const user = await getUserByEmail(email);
  if (user) {
    await linkSocialProvider(user.userId, socialData);
  }
}
```

### Phase 2: Google 로그인 구현

#### 2.1 의존성 설치

```bash
# Expo Google Sign In
npx expo install @react-native-google-signin/google-signin

# 또는 Expo의 AuthSession 사용 (권장)
npx expo install expo-auth-session expo-crypto
```

#### 2.2 Google 설정

**app.json 업데이트:**
```json
{
  "expo": {
    "plugins": [
      "@react-native-google-signin/google-signin"
    ],
    "android": {
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist"
    }
  }
}
```

#### 2.3 Google 로그인 구현

**파일:** `packages/mobile/src/components/GoogleSignInButton.tsx`

```typescript
import React, { useState } from 'react';
import { TouchableOpacity, Text, Image, ActivityIndicator } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';

// Google 설정
GoogleSignin.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com', // Firebase Console에서
  offlineAccess: false,
});

interface Props {
  onSuccess: (socialData: SocialUserData) => void;
  onError: (error: Error) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: Props) {
  const [loading, setLoading] = useState(false);
  
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // 1. Google Sign In
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      // 2. Firebase credential 생성
      const googleCredential = GoogleAuthProvider.credential(
        userInfo.idToken
      );
      
      // 3. Firebase Auth로 로그인
      const result = await signInWithCredential(auth, googleCredential);
      
      // 4. 사용자 데이터 추출
      const socialData: SocialUserData = {
        email: result.user.email!,
        name: result.user.displayName || '',
        photoURL: result.user.photoURL || undefined,
        providerId: 'google.com',
        providerUid: result.user.uid,
        idToken: userInfo.idToken,
      };
      
      onSuccess(socialData);
      
    } catch (error: any) {
      console.error('Google 로그인 실패:', error);
      onError(error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handleGoogleSignIn}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#4285F4" />
      ) : (
        <>
          <Image 
            source={require('../../assets/google-icon.png')} 
            style={styles.icon} 
          />
          <Text style={styles.text}>Google로 계속하기</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  icon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3c4043',
  },
});
```

#### 2.4 SignInScreen 업데이트

```typescript
// SignInScreen.tsx에 추가

import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { handleSocialLogin } from '../services/socialAuthService';

// ... 기존 코드

const handleGoogleSignInSuccess = async (socialData: SocialUserData) => {
  try {
    const result = await handleSocialLogin(socialData);
    
    if (result.action === 'LOGIN') {
      // 기존 계정 로그인 성공
      Alert.alert('로그인 성공', '환영합니다!');
      onSignInSuccess();
    } else if (result.action === 'SIGNUP') {
      // 회원가입 필요 → Step 1로 이동
      navigateToSignUp(socialData);
    } else if (result.action === 'LINK_ACTIVE') {
      // 기존 active 계정 발견 → 연동 확인 필요
      await handleLinkActiveAccount(result.user!, socialData);
    }
  } catch (error) {
    console.error('소셜 로그인 처리 실패:', error);
    Alert.alert('오류', '로그인 중 오류가 발생했습니다.');
  }
};

// JSX에 추가
return (
  // ... 기존 로그인 폼
  
  <View style={styles.divider}>
    <View style={styles.dividerLine} />
    <Text style={styles.dividerText}>또는</Text>
    <View style={styles.dividerLine} />
  </View>
  
  <GoogleSignInButton
    onSuccess={handleGoogleSignInSuccess}
    onError={(error) => Alert.alert('오류', '로그인에 실패했습니다.')}
  />
  
  {Platform.OS === 'ios' && (
    <AppleSignInButton
      onSuccess={handleAppleSignInSuccess}
      onError={(error) => Alert.alert('오류', '로그인에 실패했습니다.')}
    />
  )}
);
```

### Phase 3: 회원가입 플로우 통합

#### 3.1 회원가입 State 관리

**새 파일:** `packages/mobile/src/screens/SignUpFlow.tsx`

```typescript
import React, { useState } from 'react';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
import { SignUpStep4Screen } from './SignUpStep4Screen';

interface Props {
  role: 'mentor' | 'foreign';
  initialSocialData?: SocialUserData;
  onComplete: () => void;
  onCancel: () => void;
}

export function SignUpFlow({ 
  role, 
  initialSocialData, 
  onComplete, 
  onCancel 
}: Props) {
  const [step, setStep] = useState(1);
  const [signUpData, setSignUpData] = useState<SignUpState>({
    name: initialSocialData?.name || '',
    phone: '',
    isSocialSignUp: !!initialSocialData,
    socialData: initialSocialData,
  });
  
  const handleStep1Complete = (data: { name: string; phone: string }) => {
    setSignUpData(prev => ({ ...prev, ...data }));
    
    // 소셜 로그인이면 Step 2 건너뛰기
    if (signUpData.isSocialSignUp) {
      setStep(3);
    } else {
      setStep(2);
    }
  };
  
  const handleStep2Complete = (data: { email: string; password: string }) => {
    setSignUpData(prev => ({ ...prev, ...data }));
    setStep(3);
  };
  
  const handleStep3Complete = (data: { 
    university: string; 
    grade: number;
    isOnLeave: boolean | null;
    major1: string;
    major2?: string;
  }) => {
    setSignUpData(prev => ({ ...prev, ...data }));
    setStep(4);
  };
  
  const handleStep4Complete = async (data: {
    selfIntroduction?: string;
    jobMotivation?: string;
    // ... 기타 필드
  }) => {
    const finalData = { ...signUpData, ...data };
    
    try {
      if (finalData.isSocialSignUp && finalData.socialData) {
        // 소셜 회원가입 처리
        await handleSocialSignUp(finalData);
      } else {
        // 일반 회원가입 처리
        await handleNormalSignUp(finalData);
      }
      
      onComplete();
    } catch (error) {
      console.error('회원가입 실패:', error);
      Alert.alert('오류', '회원가입 중 오류가 발생했습니다.');
    }
  };
  
  const handleBack = () => {
    if (step === 1) {
      onCancel();
    } else if (step === 3 && signUpData.isSocialSignUp) {
      // 소셜 로그인에서는 Step 2가 없으므로 Step 1로
      setStep(1);
    } else {
      setStep(step - 1);
    }
  };
  
  switch (step) {
    case 1:
      return (
        <SignUpStep1Screen
          onNext={handleStep1Complete}
          onSignInPress={onCancel}
          initialName={signUpData.name}
          isSocialSignUp={signUpData.isSocialSignUp}
        />
      );
      
    case 2:
      return (
        <SignUpStep2Screen
          name={signUpData.name}
          phone={signUpData.phone}
          onNext={handleStep2Complete}
          onBack={handleBack}
        />
      );
      
    case 3:
      return (
        <SignUpStep3Screen
          name={signUpData.name}
          phone={signUpData.phone}
          email={signUpData.email || signUpData.socialData?.email || ''}
          password={signUpData.password || ''}
          onNext={handleStep3Complete}
          onBack={handleBack}
        />
      );
      
    case 4:
      return (
        <SignUpStep4Screen
          signUpData={signUpData}
          onNext={handleStep4Complete}
          onBack={handleBack}
        />
      );
      
    default:
      return null;
  }
}

// 소셜 회원가입 처리
async function handleSocialSignUp(data: SignUpState) {
  const { socialData, tempUserId, phone } = data;
  
  if (!socialData) {
    throw new Error('소셜 로그인 데이터가 없습니다');
  }
  
  if (tempUserId) {
    // temp 계정 활성화
    await activateTempAccountWithSocial(tempUserId, socialData, {
      university: data.university,
      grade: data.grade,
      isOnLeave: data.isOnLeave,
      major1: data.major1,
      major2: data.major2,
      selfIntroduction: data.selfIntroduction,
      jobMotivation: data.jobMotivation,
    });
  } else {
    // 새 계정 생성 (소셜)
    await createNewSocialUser(data);
  }
}

// 일반 회원가입 처리 (기존 로직)
async function handleNormalSignUp(data: SignUpState) {
  // 기존 회원가입 로직
}
```

#### 3.2 SignUpStep1Screen 수정

```typescript
// SignUpStep1Screen.tsx

interface SignUpStep1ScreenProps {
  onNext: (data: { name: string; phone: string }) => void;
  onSignInPress: () => void;
  initialName?: string;  // 소셜에서 받은 이름
  isSocialSignUp?: boolean;
}

export function SignUpStep1Screen({
  onNext,
  onSignInPress,
  initialName = '',
  isSocialSignUp = false,
}: SignUpStep1ScreenProps) {
  const [name, setName] = useState(initialName);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    // 유효성 검사
    if (!name || name.length < 2) {
      Alert.alert('입력 오류', '이름은 최소 2자 이상이어야 합니다.');
      return;
    }

    if (!phoneNumber || phoneNumber.length < 10) {
      Alert.alert('입력 오류', '유효한 휴대폰 번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const userByPhone = await getUserByPhone(phoneNumber);

      if (userByPhone) {
        const { name: userName, status, jobExperiences } = userByPhone;

        if (name === userName && status === 'temp') {
          // temp 계정 발견 → 연동 확인
          const jobCodes = await getUserJobCodesInfo(jobExperiences || []);
          
          const confirm = await showConfirmDialog(
            `${userName}님의 계정을 찾았습니다.\n\n` +
            `담당 업무:\n${jobCodes.map(j => `- ${j.generation} ${j.code}`).join('\n')}\n\n` +
            `${isSocialSignUp ? '소셜 계정과 ' : ''}연동하시겠습니까?`
          );
          
          if (confirm) {
            // tempUserId 전달
            onNext({ 
              name, 
              phone: phoneNumber,
              tempUserId: userByPhone.userId // 추가
            });
            return;
          }
        } else if (status === 'active') {
          if (isSocialSignUp) {
            // 소셜 로그인인데 active 계정 발견 → 연동 제안
            await handleLinkActiveAccount(userByPhone);
            return;
          } else {
            Alert.alert(
              '가입 정보 확인',
              '이미 가입된 유저입니다. 로그인 화면으로 이동합니다.',
              [{ text: '확인', onPress: onSignInPress }]
            );
            return;
          }
        }
      }

      // temp 계정 없음 또는 연동 거부 → 다음 단계
      onNext({ name, phone: phoneNumber });
      
    } catch (error) {
      console.error('사용자 정보 확인 오류:', error);
      Alert.alert('오류', '사용자 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.stepIndicator}>
        {isSocialSignUp ? '1/3 단계' : '1/4 단계'}: 개인 정보
      </Text>
      
      {isSocialSignUp && (
        <View style={styles.socialBadge}>
          <Ionicons name="logo-google" size={16} color="#4285F4" />
          <Text style={styles.socialBadgeText}>
            Google 계정으로 가입 중
          </Text>
        </View>
      )}
      
      {/* 나머지 UI는 동일 */}
    </View>
  );
}
```

### Phase 4: 테스트 및 최적화

#### 4.1 테스트 시나리오

**시나리오 1: 신규 사용자 소셜 가입**
1. Google 로그인 → Step 1 (전화번호 입력) → Step 3 → Step 4 → 완료

**시나리오 2: temp 계정 있는 사용자**
1. Google 로그인 → Step 1 (전화번호 입력)
2. temp 계정 발견 → 연동 확인 → Step 3 → Step 4 → 완료

**시나리오 3: 이미 가입한 사용자 (다른 이메일)**
1. Google 로그인 → Step 1 (전화번호 입력)
2. active 계정 발견 → 연동 확인 다이얼로그
3. 비밀번호 입력 → 연동 완료 → 로그인

**시나리오 4: 이미 가입한 사용자 (같은 이메일)**
1. Google 로그인 → 즉시 로그인 완료

#### 4.2 에러 처리

```typescript
// 공통 에러 처리
export function handleSocialAuthError(error: any) {
  if (error.code === 'auth/account-exists-with-different-credential') {
    return '이 이메일은 다른 방법으로 가입되어 있습니다.';
  } else if (error.code === 'auth/credential-already-in-use') {
    return '이 소셜 계정은 이미 다른 계정에 연결되어 있습니다.';
  } else if (error.code === 'auth/cancelled-popup-request') {
    return '로그인이 취소되었습니다.';
  } else if (error.code === 'ALREADY_REGISTERED') {
    return '이미 가입된 계정입니다. 로그인 화면에서 소셜 로그인을 시도하세요.';
  }
  return '로그인 중 오류가 발생했습니다.';
}
```

## 📊 데이터 흐름

### 소셜 회원가입 플로우
```
1. SignInScreen
   ↓ [Google 로그인 버튼 클릭]
   
2. Google OAuth
   ↓ [인증 완료]
   
3. handleSocialLogin(socialData)
   ↓ [이메일로 검색 → 없음]
   
4. SignUpFlow (isSocialSignUp: true)
   ↓
   
5. Step 1: 전화번호 입력
   ↓ [temp 계정 검색]
   
6a. temp 발견 → 연동 확인 → tempUserId 저장
6b. 없음 → 신규 가입
   ↓
   
7. Step 2 건너뛰기 (자동)
   ↓
   
8. Step 3: 교육정보 입력
   ↓
   
9. Step 4: 직무정보 입력
   ↓
   
10. Firebase Auth + Firestore 업데이트
    - temp → active (또는 신규 생성)
    - authProviders 추가
    ↓
    
11. 회원가입 완료 → 로그인
```

## 🎨 UI/UX 개선사항

### 진행 상태 표시

```typescript
// 소셜 로그인 시
<View style={styles.progressBar}>
  <View style={[styles.step, styles.stepActive]} />  {/* Step 1 */}
  <View style={styles.stepSkipped} />                {/* Step 2 SKIP */}
  <View style={styles.step} />                       {/* Step 3 */}
  <View style={styles.step} />                       {/* Step 4 */}
</View>

// 일반 로그인 시
<View style={styles.progressBar}>
  <View style={[styles.step, styles.stepActive]} />  {/* Step 1 */}
  <View style={styles.step} />                       {/* Step 2 */}
  <View style={styles.step} />                       {/* Step 3 */}
  <View style={styles.step} />                       {/* Step 4 */}
</View>
```

### 소셜 계정 표시

```typescript
// Step 1에서 소셜 계정 정보 표시
{isSocialSignUp && socialData && (
  <View style={styles.socialAccountInfo}>
    {socialData.photoURL && (
      <Image 
        source={{ uri: socialData.photoURL }} 
        style={styles.avatar} 
      />
    )}
    <View>
      <Text style={styles.socialEmail}>{socialData.email}</Text>
      <Text style={styles.socialProvider}>
        {socialData.providerId === 'google.com' ? 'Google' : 'Apple'} 계정
      </Text>
    </View>
  </View>
)}
```

## 📝 다음 단계

1. ✅ Phase 1: 기본 구조 준비
2. ⬜ Phase 2: Google 로그인 구현
3. ⬜ Phase 3: 회원가입 플로우 통합
4. ⬜ Phase 4: Apple 로그인 추가 (iOS)
5. ⬜ Phase 5: 테스트 및 최적화
6. ⬜ Phase 6: 설정 화면에서 계정 관리 기능

## 🚀 구현 시작

Phase 1부터 단계적으로 구현하시겠습니까?
