/**
 * 국가 코드별 전화번호 포맷팅 유틸리티
 */

/**
 * 전화번호를 국가별 형식에 맞게 포맷팅
 * @param phoneNumber - 국가코드 포함된 전화번호 (예: +821012345678)
 * @returns 포맷팅된 전화번호 (예: +82 10-1234-5678)
 */
export function formatPhoneNumber(phoneNumber?: string): string {
  if (!phoneNumber) return '-';
  
  // 공백 제거
  const cleaned = phoneNumber.replace(/\s/g, '');
  
  // 국가코드별 포맷팅
  
  // 한국 (+82)
  if (cleaned.startsWith('+82')) {
    const number = cleaned.substring(3); // +82 제거
    
    // 잘못된 형식 처리: 0으로 시작하는 경우 (예: +8201012345678)
    if (number.startsWith('0') && number.length === 11) {
      // 0을 제거하고 다시 처리
      const correctedNumber = number.substring(1);
      if (correctedNumber.startsWith('10') && correctedNumber.length === 10) {
        return `+82 0${correctedNumber.substring(0, 2)}-${correctedNumber.substring(2, 6)}-${correctedNumber.substring(6)}`;
      }
    }
    
    // 010-1234-5678 형식 (올바른 형식)
    if (number.startsWith('10') && number.length === 10) {
      return `+82 0${number.substring(0, 2)}-${number.substring(2, 6)}-${number.substring(6)}`;
    }
    // 02-1234-5678 형식 (서울)
    if (number.startsWith('2') && number.length === 9) {
      return `+82 0${number.substring(0, 1)}-${number.substring(1, 5)}-${number.substring(5)}`;
    }
    // 기타 지역번호 (031, 032 등)
    if (number.length === 10) {
      return `+82 0${number.substring(0, 2)}-${number.substring(2, 6)}-${number.substring(6)}`;
    }
    if (number.length === 9) {
      return `+82 0${number.substring(0, 2)}-${number.substring(2, 5)}-${number.substring(5)}`;
    }
  }
  
  // 미국/캐나다 (+1)
  if (cleaned.startsWith('+1')) {
    const number = cleaned.substring(2); // +1 제거
    
    // (123) 456-7890 형식
    if (number.length === 10) {
      return `+1 (${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
    }
  }
  
  // 영국 (+44)
  if (cleaned.startsWith('+44')) {
    const number = cleaned.substring(3); // +44 제거
    
    // 07123 456789 형식 (모바일)
    if (number.startsWith('7') && number.length === 10) {
      return `+44 ${number.substring(0, 5)} ${number.substring(5)}`;
    }
    // 020 1234 5678 형식 (런던)
    if (number.startsWith('20') && number.length === 10) {
      return `+44 ${number.substring(0, 3)} ${number.substring(3, 7)} ${number.substring(7)}`;
    }
    // 기타
    if (number.length === 10) {
      return `+44 ${number.substring(0, 4)} ${number.substring(4, 7)} ${number.substring(7)}`;
    }
  }
  
  // 아일랜드 (+353)
  if (cleaned.startsWith('+353')) {
    const number = cleaned.substring(4); // +353 제거
    
    // 087 123 4567 형식 (모바일)
    if ((number.startsWith('8') || number.startsWith('85')) && number.length === 9) {
      return `+353 ${number.substring(0, 3)} ${number.substring(3, 6)} ${number.substring(6)}`;
    }
    // 01 234 5678 형식 (더블린)
    if (number.startsWith('1') && number.length === 8) {
      return `+353 ${number.substring(0, 2)} ${number.substring(2, 5)} ${number.substring(5)}`;
    }
  }
  
  // 호주 (+61)
  if (cleaned.startsWith('+61')) {
    const number = cleaned.substring(3); // +61 제거
    
    // 0412 345 678 형식 (모바일)
    if (number.startsWith('4') && number.length === 9) {
      return `+61 ${number.substring(0, 4)} ${number.substring(4, 7)} ${number.substring(7)}`;
    }
    // 02 1234 5678 형식 (시드니)
    if (number.startsWith('2') && number.length === 9) {
      return `+61 ${number.substring(0, 1)} ${number.substring(1, 5)} ${number.substring(5)}`;
    }
  }
  
  // 뉴질랜드 (+64)
  if (cleaned.startsWith('+64')) {
    const number = cleaned.substring(3); // +64 제거
    
    // 021 123 4567 형식 (모바일)
    if ((number.startsWith('2') || number.startsWith('21') || number.startsWith('22')) && number.length === 9) {
      return `+64 ${number.substring(0, 3)} ${number.substring(3, 6)} ${number.substring(6)}`;
    }
    // 09 123 4567 형식 (오클랜드)
    if (number.startsWith('9') && number.length === 9) {
      return `+64 ${number.substring(0, 2)} ${number.substring(2, 5)} ${number.substring(5)}`;
    }
  }
  
  // 남아프리카 (+27)
  if (cleaned.startsWith('+27')) {
    const number = cleaned.substring(3); // +27 제거
    
    // 082 123 4567 형식
    if (number.length === 9) {
      return `+27 ${number.substring(0, 3)} ${number.substring(3, 6)} ${number.substring(6)}`;
    }
  }
  
  // 기본 포맷 (국가코드 + 공백 + 나머지)
  if (cleaned.startsWith('+')) {
    // 국가코드 찾기
    let countryCode = '+';
    let i = 1;
    while (i < cleaned.length && /\d/.test(cleaned[i]) && i <= 4) {
      countryCode += cleaned[i];
      i++;
    }
    
    const number = cleaned.substring(countryCode.length);
    
    // 3-4자리씩 나누기
    if (number.length <= 4) {
      return `${countryCode} ${number}`;
    } else if (number.length <= 7) {
      return `${countryCode} ${number.substring(0, 3)}-${number.substring(3)}`;
    } else if (number.length <= 11) {
      return `${countryCode} ${number.substring(0, 3)}-${number.substring(3, 7)}-${number.substring(7)}`;
    } else {
      return `${countryCode} ${number.substring(0, 4)}-${number.substring(4, 8)}-${number.substring(8)}`;
    }
  }
  
  // 국가코드가 없는 경우 (한국 번호로 가정)
  const onlyNumbers = cleaned.replace(/\D/g, '');
  if (onlyNumbers.length === 11) {
    return `${onlyNumbers.substring(0, 3)}-${onlyNumbers.substring(3, 7)}-${onlyNumbers.substring(7)}`;
  } else if (onlyNumbers.length === 10) {
    return `${onlyNumbers.substring(0, 3)}-${onlyNumbers.substring(3, 6)}-${onlyNumbers.substring(6)}`;
  }
  
  return phoneNumber;
}

/**
 * 전화번호에서 국가 정보 추출
 * @param phoneNumber - 국가코드 포함된 전화번호
 * @returns 국가 정보 객체
 */
export function getCountryInfo(phoneNumber?: string): { code: string; name: string; flag: string } | null {
  if (!phoneNumber) return null;
  
  const cleaned = phoneNumber.replace(/\s/g, '');
  
  const countryMap: { [key: string]: { name: string; flag: string } } = {
    '+82': { name: 'South Korea', flag: '🇰🇷' },
    '+1': { name: 'USA/Canada', flag: '🇺🇸' },
    '+44': { name: 'United Kingdom', flag: '🇬🇧' },
    '+353': { name: 'Ireland', flag: '🇮🇪' },
    '+61': { name: 'Australia', flag: '🇦🇺' },
    '+64': { name: 'New Zealand', flag: '🇳🇿' },
    '+27': { name: 'South Africa', flag: '🇿🇦' },
  };
  
  for (const [code, info] of Object.entries(countryMap)) {
    if (cleaned.startsWith(code)) {
      return { code, ...info };
    }
  }
  
  return null;
}

/**
 * 국가코드별 전화번호 placeholder 반환
 * @param countryCode - 국가코드 (예: '+82', '+1')
 * @returns placeholder 문자열
 */
export function getPhonePlaceholder(countryCode: string): string {
  const placeholders: { [key: string]: string } = {
    '+82': '01012345678',
    '+1': '2025551234',
    '+44': '7400123456',
    '+353': '851234567',
    '+61': '412345678',
    '+64': '211234567',
    '+27': '821234567',
  };
  
  return placeholders[countryCode] || 'Enter phone number';
}
