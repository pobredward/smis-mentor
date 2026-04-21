/**
 * 국가코드별 전화번호 포맷팅 유틸리티
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
    // 국가코드 찾기 (최대 4자리)
    let countryCodeLength = 2;
    for (let i = 2; i <= 4; i++) {
      const potentialCode = cleaned.substring(0, i + 1);
      if (['+1', '+7', '+20', '+27', '+30', '+31', '+32', '+33', '+34', '+36', '+39', '+40', '+41', '+43', '+44', '+45', '+46', '+47', '+48', '+49', '+51', '+52', '+53', '+54', '+55', '+56', '+57', '+58', '+60', '+61', '+62', '+63', '+64', '+65', '+66', '+81', '+82', '+84', '+86', '+90', '+91', '+92', '+93', '+94', '+95', '+98', '+212', '+213', '+216', '+218', '+220', '+221', '+222', '+223', '+224', '+225', '+226', '+227', '+228', '+229', '+230', '+231', '+232', '+233', '+234', '+235', '+236', '+237', '+238', '+239', '+240', '+241', '+242', '+243', '+244', '+245', '+246', '+248', '+249', '+250', '+251', '+252', '+253', '+254', '+255', '+256', '+257', '+258', '+260', '+261', '+262', '+263', '+264', '+265', '+266', '+267', '+268', '+269', '+290', '+291', '+297', '+298', '+299', '+350', '+351', '+352', '+353', '+354', '+355', '+356', '+357', '+358', '+359', '+370', '+371', '+372', '+373', '+374', '+375', '+376', '+377', '+378', '+380', '+381', '+382', '+383', '+385', '+386', '+387', '+389', '+420', '+421', '+423', '+500', '+501', '+502', '+503', '+504', '+505', '+506', '+507', '+508', '+509', '+590', '+591', '+592', '+593', '+594', '+595', '+596', '+597', '+598', '+599', '+670', '+672', '+673', '+674', '+675', '+676', '+677', '+678', '+679', '+680', '+681', '+682', '+683', '+684', '+685', '+686', '+687', '+688', '+689', '+690', '+691', '+692', '+850', '+852', '+853', '+855', '+856', '+880', '+886', '+960', '+961', '+962', '+963', '+964', '+965', '+966', '+967', '+968', '+970', '+971', '+972', '+973', '+974', '+975', '+976', '+977', '+992', '+993', '+994', '+995', '+996', '+998'].includes(potentialCode)) {
        countryCodeLength = i;
      }
    }
    
    const countryCode = cleaned.substring(0, countryCodeLength + 1);
    const number = cleaned.substring(countryCodeLength + 1);
    
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
 * 멘토용 전화번호 포맷팅 (국가코드 제거)
 * @param phoneNumber - 전화번호 (국가코드 포함 가능)
 * @returns 국가코드 없는 포맷팅된 전화번호 (예: 010-1234-5678)
 */
export function formatPhoneNumberForMentor(phoneNumber?: string): string {
  if (!phoneNumber) return '-';
  
  // 공백 제거
  const cleaned = phoneNumber.replace(/\s/g, '');
  
  // 한국 국가코드 제거
  let phoneOnly = cleaned;
  if (cleaned.startsWith('+82')) {
    phoneOnly = cleaned.substring(3); // +82 제거
    // 잘못된 형식 처리: 0으로 시작하는 경우 (예: +8201012345678)
    if (phoneOnly.startsWith('0') && phoneOnly.length === 11) {
      phoneOnly = phoneOnly.substring(1); // 0 제거
    }
    // 앞에 0이 없으면 추가 (10 -> 010)
    if (!phoneOnly.startsWith('0') && phoneOnly.length === 10) {
      phoneOnly = '0' + phoneOnly;
    }
  } else if (cleaned.startsWith('82')) {
    phoneOnly = cleaned.substring(2); // 82 제거
    // 앞에 0이 없으면 추가
    if (!phoneOnly.startsWith('0') && phoneOnly.length === 10) {
      phoneOnly = '0' + phoneOnly;
    }
  }
  
  // 숫자만 추출
  const onlyNumbers = phoneOnly.replace(/\D/g, '');
  
  // 한국 전화번호 형식으로 포맷팅
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