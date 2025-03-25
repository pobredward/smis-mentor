import { forwardRef, useState, useEffect, InputHTMLAttributes, ChangeEvent } from 'react';

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  returnRawValue?: boolean; // true이면 하이픈이 없는 원시 값을 반환
}

// 전화번호 포맷 함수 (010-1234-5678 형식)
export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';
  
  // 숫자만 남기기
  const phoneNumber = value.replace(/[^\d]/g, '');
  
  // 숫자 길이에 따라 포맷팅
  if (phoneNumber.length < 4) {
    return phoneNumber;
  } else if (phoneNumber.length < 8) {
    return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
  } else {
    return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7, 11)}`;
  }
};

// 포맷된 전화번호에서 하이픈 제거
export const unformatPhoneNumber = (value: string): string => {
  return value.replace(/-/g, '');
};

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ label, error, className = '', value = '', onChange, returnRawValue = false, ...props }, ref) => {
    // 내부 포맷된 값 상태
    const [formattedValue, setFormattedValue] = useState<string>(() => formatPhoneNumber(value || ''));
    
    // 외부 value prop이 변경되면 포맷팅 업데이트
    useEffect(() => {
      setFormattedValue(formatPhoneNumber(value || ''));
    }, [value]);
    
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      
      // 입력값에서 숫자만 추출
      const numbersOnly = input.replace(/[^\d]/g, '');
      
      // 11자리로 제한 (한국 전화번호 형식)
      if (numbersOnly.length <= 11) {
        // 포맷팅된 값으로 상태 업데이트
        const formatted = formatPhoneNumber(numbersOnly);
        setFormattedValue(formatted);
        
        // 상위 컴포넌트로 값 전달 (설정에 따라 포맷된 값 또는 원시 값)
        onChange(returnRawValue ? numbersOnly : formatted);
      }
    };

    return (
      <div className="w-full mb-4">
        <label className="block text-gray-700 text-sm font-medium mb-1">{label}</label>
        <div className="relative">
          <input
            ref={ref}
            type="tel"
            inputMode="numeric"
            className={`w-full px-3 py-2 border ${
              error ? 'border-red-500' : 'border-gray-300'
            } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${className}`}
            value={formattedValue}
            onChange={handleChange}
            placeholder="010-0000-0000"
            maxLength={13} // 하이픈 포함 최대 길이
            {...props}
          />
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export default PhoneInput; 