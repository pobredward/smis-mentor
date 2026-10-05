'use client';

/**
 * 학부모 가입 — 이름 · 휴대폰(문자 인증 필수) · 이메일/비밀번호 (소셜로 온 경우는 이메일/비밀번호 없이)
 * 가입하면 role 'parent'. 아이(캠프 학생)는 관리자가 연결한다.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { usePhoneAuth } from '@/components/auth/PhoneAuthDialog';
import { auth } from '@/lib/firebase';
import { signUp, signUpWithSocialToken, completeSignupViaApi } from '@/lib/firebaseService';
import { signupStorage, type SignUpData } from '@/utils/signupStorage';
import { logger, TERMS_URL, PRIVACY_POLICY_URL, type SignupProviderId } from '@smis-mentor/shared';

const digits = (v: string) => v.replace(/\D/g, '');

export default function ParentSignUpPage() {
  const router = useRouter();
  const [social, setSocial] = useState<SignUpData | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phoneDialog, startPhoneAuth] = usePhoneAuth();

  // 소셜 로그인에서 '학부모'를 골라 온 경우 (로그인 화면이 signupStorage 에 남김)
  useEffect(() => {
    const s = signupStorage.get();
    if (s?.socialSignUp) {
      setSocial(s);
      if (s.socialDisplayName || s.name) setName(String(s.socialDisplayName || s.name));
    }
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = '이름은 2자 이상 입력해주세요.';
    const p = digits(phone);
    if (p.length < 10 || p.length > 11) e.phone = '휴대폰 번호를 확인해주세요.';
    if (!social) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = '이메일을 확인해주세요.';
      if (password.length < 8) e.password = '비밀번호는 8자 이상이어야 합니다.';
      if (password !== password2) e.password2 = '비밀번호가 서로 다릅니다.';
    }
    if (!agree) e.agree = '약관과 개인정보 처리방침에 동의해주세요.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy || !validate()) return;
    const phoneNumber = digits(phone);
    // 번호 주인 확인 (학부모 가입은 문자 인증 필수 — 서버도 다시 확인)
    const verified = await startPhoneAuth({ purpose: 'verify', phone: phoneNumber });
    if (!verified) return;

    setBusy(true);
    try {
      let provider: { providerId: SignupProviderId; providerUid?: string; displayName?: string; photoURL?: string };
      if (social) {
        const kind = String(social.socialProvider || '');
        if (kind === 'google' || kind === 'apple') {
          // 구글 · 애플: 로그인 화면의 팝업 세션을 그대로 쓴다
          if (!auth.currentUser) {
            toast.error('로그인 정보가 만료되었습니다. 다시 로그인해주세요.');
            signupStorage.clear();
            router.push('/sign-in');
            return;
          }
        } else if (kind === 'naver' || kind === 'kakao') {
          if (!social.socialAccessToken) {
            toast.error('로그인 정보가 만료되었습니다. 다시 로그인해주세요.');
            signupStorage.clear();
            router.push('/sign-in');
            return;
          }
          await signUpWithSocialToken({ kind, accessToken: social.socialAccessToken });
        } else {
          throw new Error('알 수 없는 로그인 방법');
        }
        provider = {
          providerId: (kind === 'naver' || kind === 'kakao' ? kind : `${kind}.com`) as SignupProviderId,
          providerUid: social.socialProviderUid,
          displayName: social.socialDisplayName,
          photoURL: social.socialPhotoURL,
        };
      } else {
        await signUp(email.trim().toLowerCase(), password);
        provider = { providerId: 'password' };
      }

      await completeSignupViaApi({
        kind: 'parent',
        rollbackAuthOnFailure: !social,
        provider,
        profile: { name: name.trim(), phoneNumber, agreedPersonal: true },
      });
      signupStorage.clear();
      toast.success('가입이 완료되었습니다.');
      // 소셜 가입은 Auth 상태가 바뀌지 않으므로 새로 불러와 사용자 정보를 다시 읽는다
      setTimeout(() => { window.location.href = '/parent'; }, 500);
    } catch (e) {
      logger.error('학부모 가입 오류:', e);
      const msg = String((e as Error)?.message || '');
      if ((e as { code?: string })?.code === 'auth/email-already-in-use') {
        toast.error('이미 가입된 이메일입니다. 로그인해주세요.');
      } else {
        toast.error(/[가-힣]/.test(msg) ? msg : '가입 중 오류가 발생했습니다.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      {phoneDialog}
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">학부모 가입</h1>
        <p className="text-sm text-gray-600 text-center mb-8">
          가입 후 캠프 운영진이 확인하여 아이를 연결해 드립니다.
        </p>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormInput label="이름" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
          <FormInput label="휴대폰 번호" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone}
            inputMode="numeric" placeholder="01012345678" autoComplete="tel" />
          {!social && (
            <>
              <FormInput label="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" />
              <FormInput label="비밀번호" type="password" showPasswordToggle value={password} onChange={(e) => setPassword(e.target.value)}
                error={errors.password} autoComplete="new-password" />
              <FormInput label="비밀번호 확인" type="password" showPasswordToggle value={password2} onChange={(e) => setPassword2(e.target.value)}
                error={errors.password2} autoComplete="new-password" />
            </>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline">이용약관</a>과{' '}
              <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline">개인정보 처리방침</a>에 동의합니다.
            </span>
          </label>
          {errors.agree && <p className="text-sm text-red-600">{errors.agree}</p>}
          <Button type="submit" variant="primary" fullWidth isLoading={busy}>
            휴대폰 인증하고 가입하기
          </Button>
        </form>
        <div className="text-center mt-6">
          <button type="button" onClick={() => router.push('/sign-in')} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </Layout>
  );
}
