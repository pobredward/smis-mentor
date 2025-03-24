/**
 * 주민등록번호 앞자리와 뒷자리 첫 번째 숫자를 통해 성별을 결정합니다.
 * 1, 3, 5, 7: 남성(M)
 * 2, 4, 6, 8: 여성(F)
 */
export const getGenderFromRRN = (rrnFront: string, rrnLast: string): 'M' | 'F' | '' => {
  if (!rrnFront || !rrnLast || rrnFront.length !== 6 || rrnLast.length !== 7) {
    return '';
  }

  const firstDigitOfRrnLast = parseInt(rrnLast.charAt(0), 10);
  
  // 주민번호 뒷자리 첫 번째 숫자가 홀수면 남성, 짝수면 여성
  if ([1, 3, 5, 7].includes(firstDigitOfRrnLast)) {
    return 'M';
  } else if ([2, 4, 6, 8].includes(firstDigitOfRrnLast)) {
    return 'F';
  }
  
  return '';
};

/**
 * 주민등록번호 앞자리를 통해 나이를 계산합니다.
 * 주민번호 뒷자리 첫 번째 숫자에 따라 출생 연도를 결정:
 * 1, 2: 1900년대
 * 3, 4: 2000년대
 * 5, 6: 1900년대 외국인
 * 7, 8: 2000년대 외국인
 */
export const getAgeFromRRN = (rrnFront: string, rrnLast: string): number => {
  if (!rrnFront || !rrnLast || rrnFront.length !== 6 || rrnLast.length !== 7) {
    return 0;
  }

  const birthYear = rrnFront.substring(0, 2);
  const birthMonth = rrnFront.substring(2, 4);
  const birthDay = rrnFront.substring(4, 6);
  const firstDigitOfRrnLast = parseInt(rrnLast.charAt(0), 10);

  // 출생 연도의 세기 결정
  let fullBirthYear: number;
  if ([1, 2, 5, 6].includes(firstDigitOfRrnLast)) {
    // 1900년대생
    fullBirthYear = 1900 + parseInt(birthYear, 10);
  } else if ([3, 4, 7, 8].includes(firstDigitOfRrnLast)) {
    // 2000년대생
    fullBirthYear = 2000 + parseInt(birthYear, 10);
  } else {
    return 0;
  }

  // 현실적인 나이 검증 (124세와 같은 비현실적인 나이 방지)
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // 출생 연도가 현재 연도보다 크거나, 현재 연도에서 출생 연도를 뺀 값이 120보다 크면 잘못된 값으로 간주
  if (fullBirthYear > currentYear || (currentYear - fullBirthYear) > 120) {
    // 잘못된 값일 경우, 2000년대생으로 추정하여 다시 계산
    if (firstDigitOfRrnLast === 1 || firstDigitOfRrnLast === 2) {
      fullBirthYear = 2000 + parseInt(birthYear, 10);
    }
  }
  
  const currentMonth = today.getMonth() + 1; // 월은 0부터 시작하므로 +1
  const currentDay = today.getDate();

  // 기본 나이 계산 (현재 연도 - 출생 연도)
  let age = currentYear - fullBirthYear;

  // 생일이 아직 지나지 않았으면 나이에서 1을 뺌
  if (
    currentMonth < parseInt(birthMonth, 10) ||
    (currentMonth === parseInt(birthMonth, 10) && currentDay < parseInt(birthDay, 10))
  ) {
    age--;
  }

  return age;
};

/**
 * 주민등록번호로부터 성별과 나이 정보를 포함한 객체를 반환합니다.
 */
export const getUserInfoFromRRN = (rrnFront: string, rrnLast: string) => {
  return {
    gender: getGenderFromRRN(rrnFront, rrnLast),
    age: getAgeFromRRN(rrnFront, rrnLast)
  };
}; 