import { getFirestore, collection, doc, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { logger } from '@smis-mentor/shared';
import { db } from './firebase';

export interface STSheetStudent {
  studentId?: string;
  name?: string;
  englishName?: string;
  grade?: string;
  gender?: 'M' | 'F';
  parentPhone?: string;
  parentName?: string;
  otherPhone?: string;
  otherName?: string;
  medication?: string;
  notes?: string;
  ssn?: string;
  region?: string;
  address?: string;
  addressDetail?: string;
  email?: string;
  etc?: string;
  classNumber?: string;
  className?: string;
  classMentor?: string;
  unitMentor?: string;
  roomNumber?: string;
  rowNumber?: number;
  lastSyncedAt?: Date;
  displayFields?: Record<string, any>;
  departureRoute?: string;
  arrivalRoute?: string;
  shirtSize?: string;
  passportName?: string;
  passportNumber?: string;
  passportExpiry?: string;
  unit?: string;
  phoneNumber?: string;
  parentPhoneNumber?: string;
  schoolName?: string;
  profilePhoto?: string;
}

export type CampCode = 'E27' | 'J27' | 'S08' | string;
export type CampType = 'EJ' | 'S';

export interface JobCode {
  id: string;
  code: string;
  generation: string;
  name: string;
  location?: string;
  korea?: boolean;
}

const CAMP_SHEET_CONFIG: Record<string, { 
  spreadsheetId: string;
  sheetName: string;
  gid: string;
  type: CampType;
  useHeaderMapping: boolean;
}> = {
  'E27': {
    spreadsheetId: '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ',
    useHeaderMapping: true,
  },
  'J27': {
    spreadsheetId: '17tdhLYotT3IqkUCrUTXt9wjs5lB5pMAKKSSxtLQ3m6c',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ',
    useHeaderMapping: true,
  },
  'S08': {
    spreadsheetId: '1GQ9klMrYnv57nnbQ92LFYxBFig1EF9ewDe72obyjpC8',
    sheetName: 'ST',
    gid: '296268666',
    type: 'S',
    useHeaderMapping: true,
  },
};

const ST_SHEET_HEADER_MAPPING: Record<string, string> = {
  '고유번호': 'studentId',
  '학생 이름': 'name',
  '영어 닉네임': 'englishName',
  '학년': 'grade',
  '성별': 'gender',
  '부모님 연락처': 'parentPhone',
  '부모님 성함': 'parentName',
  '기타 연락처': 'otherPhone',
  '기타 연락처 성함': 'otherName',
  '복용약 & 알레르기': 'medication',
  '특이사항': 'notes',
  '주민등록번호': 'ssn',
  '지역': 'region',
  '도로명 주소': 'address',
  '세부 주소': 'addressDetail',
  '이메일 주소': 'email',
  '입소여정': 'departureRoute',
  '퇴소여정': 'arrivalRoute',
  '단체티': 'shirtSize',
  '여권상 영문이름': 'passportName',
  '여권 번호': 'passportNumber',
  '여권 만료일자': 'passportExpiry',
  '기타': 'etc',
  '반번호': 'classNumber',
  '반이름': 'className',
  '반멘토': 'classMentor',
  '유닛': 'unit',
  '호수': 'roomNumber',
  '프로필사진': 'profilePhoto',
};

// Google Sheets에서 데이터 가져오기
const fetchGoogleSheetsData = async (campCode: CampCode): Promise<STSheetStudent[]> => {
  try {
    const config = CAMP_SHEET_CONFIG[campCode];
    if (!config) {
      throw new Error(`캠프 코드 ${campCode}에 대한 설정을 찾을 수 없습니다.`);
    }

    logger.info(`📊 Google Sheets 데이터 가져오기 시작... (캠프: ${campCode})`);
    
    const exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=tsv&gid=${config.gid}`;
    
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const tsvData = await response.text();
    
    const lines = tsvData.split('\n').filter((line: string) => line.trim());
    const headers = lines[0].split('\t');
    logger.info(`📋 헤더 ${headers.length}개 로드`);
    
    const headerIndexMap: Record<string, number> = {};
    if (config.useHeaderMapping) {
      headers.forEach((header, index) => {
        const trimmedHeader = header.trim();
        headerIndexMap[trimmedHeader] = index;
      });
      logger.info(`📋 헤더 매핑:`, headerIndexMap);
      
      // 프로필사진 열이 있는지 확인
      if (headerIndexMap['프로필사진'] !== undefined) {
        logger.info(`✅ "프로필사진" 열 발견! 인덱스: ${headerIndexMap['프로필사진']}`);
      } else {
        logger.warn(`⚠️ "프로필사진" 열을 찾을 수 없습니다. 사용 가능한 헤더:`, Object.keys(headerIndexMap));
      }
    }
    
    const rows = lines.slice(1).map((line: string) => line.split('\t'));
    logger.info(`📊 총 ${rows.length}개 행 로드`);

    const students: STSheetStudent[] = rows
      .filter((row: any[]) => row[0] && row[0].trim())
      .map((row: any[], index: number) => {
        const getValue = (headerName: string): string => {
          if (config.useHeaderMapping) {
            const colIndex = headerIndexMap[headerName];
            if (colIndex !== undefined) {
              return row[colIndex]?.trim() || '';
            }
            return '';
          }
          return '';
        };

        const student: STSheetStudent = {
          studentId: getValue('고유번호'),
          name: getValue('학생 이름'),
          englishName: getValue('영어 닉네임'),
          grade: getValue('학년'),
          gender: (getValue('성별') || 'M') as 'M' | 'F',
          parentPhone: getValue('부모님 연락처'),
          parentName: getValue('부모님 성함'),
          otherPhone: getValue('기타 연락처'),
          otherName: getValue('기타 연락처 성함'),
          medication: getValue('복용약 & 알레르기'),
          notes: getValue('특이사항'),
          ssn: getValue('주민등록번호'),
          region: getValue('지역'),
          address: getValue('도로명 주소'),
          addressDetail: getValue('세부 주소'),
          email: getValue('이메일 주소'),
          etc: getValue('기타'),
          classNumber: getValue('반번호'),
          className: getValue('반이름'),
          classMentor: getValue('반멘토'),
          unitMentor: getValue('유닛'),
          roomNumber: getValue('호수'),
          profilePhoto: getValue('프로필사진'),
          rowNumber: index + 2,
          lastSyncedAt: new Date(),
          displayFields: {}
        };

        // 프로필사진 디버깅 (첫 5명)
        if (index < 5 && student.profilePhoto) {
          logger.info(`📸 [stSheetService] 학생 ${index + 1}:`, {
            name: student.name,
            profilePhoto: student.profilePhoto,
            photoLength: student.profilePhoto.length
          });
        }

        if (config.type === 'EJ') {
          student.departureRoute = getValue('입소여정');
          student.arrivalRoute = getValue('퇴소여정');
        } else if (config.type === 'S') {
          student.shirtSize = getValue('단체티');
          student.passportName = getValue('여권상 영문이름');
          student.passportNumber = getValue('여권 번호');
          student.passportExpiry = getValue('여권 만료일자');
        }
        
        student.unit = getValue('유닛');

        return student;
      });

    const studentsWithPhotos = students.filter(s => s.profilePhoto);
    logger.info(`✅ ${students.length}명의 학생 데이터 변환 완료 (프로필사진: ${studentsWithPhotos.length}명)`);
    return students;
  } catch (error) {
    logger.error('❌ Google Sheets 데이터 가져오기 실패:', error);
    throw error;
  }
};

// 임시 데이터 생성 함수
const getTemporaryData = (campCode: CampCode): STSheetStudent[] => {
  const campPrefix = campCode.charAt(0); // 'E', 'J', 'S' 추출
  const campType = campPrefix === 'S' ? 'S' : 'EJ';
  
  // 학생 이름 풀 (성별 구분 명확하게)
  const maleNames = [
    '김민준', '이도윤', '박서준', '최예준', '정시우', '강지호', '조준우', '윤건우',
    '장우진', '임현우', '한지훈', '오준혁', '신도현', '송민재', '배시우', '권유찬',
    '황준서', '홍지환', '구태윤', '노승우', '양현준', '탁준영', '석민석', '하윤호'
  ];
  const femaleNames = [
    '김서연', '이지우', '박서윤', '최수아', '정하윤', '강지유', '조예은', '윤채원',
    '장소율', '임하은', '한지민', '오예린', '신서현', '송지안', '배다은', '권수빈',
    '황민서', '홍유나', '구채은', '노서아', '양서영', '탁지원', '석예진', '하윤서'
  ];
  
  // 미국식 영어 이름 (성별 구분)
  const maleEnglishNames = [
    'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
    'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Andrew', 'Joshua',
    'Christopher', 'Ryan', 'Nicholas', 'Jacob', 'Tyler', 'Brandon', 'Kevin', 'Justin'
  ];
  const femaleEnglishNames = [
    'Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Mia', 'Charlotte', 'Amelia',
    'Harper', 'Evelyn', 'Abigail', 'Emily', 'Elizabeth', 'Sofia', 'Grace', 'Victoria',
    'Hannah', 'Madison', 'Lily', 'Chloe', 'Ella', 'Aria', 'Scarlett', 'Zoe'
  ];
  
  // 반 멘토 (남성 4명, 여성 4명 - 확실한 성별 구분)
  const maleMentors = ['김준호', '이민수', '박태현', '최동욱', '정현우', '강민석', '조성민', '윤재혁'];
  const femaleMentors = ['김서연', '이지은', '박수빈', '최예린', '정하늘', '강유나', '조민지', '윤채영'];
  
  // 유닛 멘토 (남성 4명, 여성 4명으로 줄여서 각 8-10명 보장)
  const maleUnitMentors = ['박준영', '김성민', '이도훈', '최현우'];
  const femaleUnitMentors = ['김민서', '이수빈', '박지은', '최서영'];
  
  // 반 이름 풀 (영어로)
  const classNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Omega'];
  
  // 입소/퇴소 공항 (EJ 캠프용) - 90% 확률로 같은 공항
  const airports = ['김포공항', '청주공항', '김해공항', '직접입소'];
  
  // 지역
  const regions = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  
  // 복용약 & 알레르기
  const medications = ['없음', '없음', '없음', '없음', '없음', '알레르기비염', '아토피', '천식', '비염약 복용'];
  
  // 티셔츠 사이즈 (S 캠프용)
  const shirtSizes = ['XS', 'S', 'M', 'L', 'XL'];
  
  // 학년 (G3~G8: 초3~중2)
  const grades = ['G3', 'G4', 'G5', 'G6', 'G7', 'G8'];
  
  const students: STSheetStudent[] = [];
  const usedClassNames = new Set<string>();
  
  // 유닛별 학생 배열 (각 유닛 멘토당 정확히 10명씩 배정)
  const unitStudents: Record<string, STSheetStudent[]> = {};
  [...maleUnitMentors, ...femaleUnitMentors].forEach(mentor => {
    unitStudents[mentor] = [];
  });
  
  // 8개 반, 각 반당 10명 (여자 짝수, 남자 짝수) = 총 80명
  // 유닛 멘토 8명 × 10명 = 80명 (정확히 일치)
  let currentMaleUnitIndex = 0;
  let currentFemaleUnitIndex = 0;
  
  for (let classIndex = 1; classIndex <= 8; classIndex++) {
    const classNum = classIndex.toString().padStart(2, '0');
    
    // 반당 학생 수 10명 고정 (여자 4-6명, 남자 4-6명, 모두 짝수)
    const femaleCount = [4, 6][Math.floor(Math.random() * 2)];
    const maleCount = 10 - femaleCount;
    
    // 반 멘토 배정 (남학생 많으면 남자 멘토, 여학생 많거나 같으면 여자 멘토)
    const classMentor = femaleCount >= maleCount 
      ? femaleMentors[classIndex - 1] 
      : maleMentors[classIndex - 1];
    
    // 반 이름 랜덤 선택 (중복 방지)
    let className = classNames[classIndex - 1];
    if (usedClassNames.has(className)) {
      const availableNames = classNames.filter(name => !usedClassNames.has(name));
      className = availableNames[Math.floor(Math.random() * availableNames.length)] || className;
    }
    usedClassNames.add(className);
    
    // 여학생 먼저, 남학생 나중에 (1~6번 여자, 7~12번 남자)
    for (let studentIndex = 1; studentIndex <= 10; studentIndex++) {
      const isFemale = studentIndex <= femaleCount;
      const studentNum = studentIndex.toString().padStart(2, '0');
      
      // 고유번호: J.001, J.002 ... (3자리)
      const globalIndex = (classIndex - 1) * 12 + studentIndex;
      const studentId = `${campPrefix}.${globalIndex.toString().padStart(3, '0')}`;
      
      // 반번호: J01.01, J01.02 ... (반.학생)
      const classNumber = `${campPrefix}${classNum}.${studentNum}`;
      
      const nameIndex = (classIndex - 1) * 6 + studentIndex - 1;
      const name = isFemale 
        ? femaleNames[nameIndex % femaleNames.length] 
        : maleNames[nameIndex % maleNames.length];
      const englishName = isFemale
        ? femaleEnglishNames[nameIndex % femaleEnglishNames.length]
        : maleEnglishNames[nameIndex % maleEnglishNames.length];
      
      // 유닛 멘토 배정 (라운드 로빈 방식으로 정확히 10명씩)
      let unitMentor: string;
      if (isFemale) {
        unitMentor = femaleUnitMentors[currentFemaleUnitIndex % femaleUnitMentors.length];
        if (unitStudents[unitMentor].length >= 10) {
          currentFemaleUnitIndex++;
          unitMentor = femaleUnitMentors[currentFemaleUnitIndex % femaleUnitMentors.length];
        }
      } else {
        unitMentor = maleUnitMentors[currentMaleUnitIndex % maleUnitMentors.length];
        if (unitStudents[unitMentor].length >= 10) {
          currentMaleUnitIndex++;
          unitMentor = maleUnitMentors[currentMaleUnitIndex % maleUnitMentors.length];
        }
      }
      
      // 학년 랜덤 (G3~G8)
      const grade = grades[Math.floor(Math.random() * grades.length)];
      
      // 주민등록번호 생성
      const gradeNum = parseInt(grade.substring(1));
      const birthYear = gradeNum <= 6 
        ? (18 - (gradeNum - 3)).toString().padStart(2, '0')  // G3=15년생, G4=14년생 ...
        : (18 - (gradeNum - 3)).toString().padStart(2, '0');  // G7=11년생, G8=10년생
      const birthMonth = (Math.floor(Math.random() * 12) + 1).toString().padStart(2, '0');
      const birthDay = (Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0');
      const genderNum = isFemale ? '2' : '1';
      const ssn = `${birthYear}${birthMonth}${birthDay}-${genderNum}******`;
      
      // 연락처
      const parentPhone = `010-${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const parentSuffix = isFemale ? '모' : '부';
      const parentName = `${name.slice(0, 1)}${parentSuffix}`;
      
      // 주소
      const region = regions[Math.floor(Math.random() * regions.length)];
      const addressTemplates = [
        `${region} 대로 ${Math.floor(Math.random() * 900 + 100)}`,
        `${region} 중앙로 ${Math.floor(Math.random() * 500 + 1)}`,
        `${region} 번영로 ${Math.floor(Math.random() * 300 + 1)}`
      ];
      const address = addressTemplates[Math.floor(Math.random() * addressTemplates.length)];
      const addressDetail = `${Math.floor(Math.random() * 20 + 1)}동 ${Math.floor(Math.random() * 500 + 100)}호`;
      
      const medication = medications[Math.floor(Math.random() * medications.length)];
      
      const student: STSheetStudent = {
        studentId,
        name,
        englishName,
        gender: isFemale ? 'F' : 'M',
        grade,
        parentPhone,
        parentName,
        medication,
        notes: '',
        ssn,
        region,
        address,
        addressDetail,
        email: `${englishName.toLowerCase()}${Math.floor(Math.random() * 99)}@example.com`,
        classNumber,
        className,
        classMentor,
        unitMentor,
        unit: unitMentor,
        roomNumber: '', // 나중에 배정
      };
      
      if (campType === 'EJ') {
        // 입소 공항 선택
        const departureAirport = airports[Math.floor(Math.random() * airports.length)];
        // 90% 확률로 같은 공항, 10% 확률로 다른 공항
        const arrivalAirport = Math.random() < 0.9 
          ? departureAirport 
          : airports[Math.floor(Math.random() * airports.length)];
        
        student.departureRoute = departureAirport;
        student.arrivalRoute = arrivalAirport;
      } else {
        student.shirtSize = shirtSizes[Math.floor(Math.random() * shirtSizes.length)];
        student.passportName = englishName.toUpperCase();
        student.passportNumber = `M${Math.floor(Math.random() * 90000000 + 10000000)}`;
        const year = 2027 + Math.floor(Math.random() * 3);
        const month = (Math.floor(Math.random() * 12) + 1).toString().padStart(2, '0');
        const day = (Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0');
        student.passportExpiry = `${year}-${month}-${day}`;
      }
      
      unitStudents[unitMentor].push(student);
      students.push(student);
    }
  }
  
  // 모든 학생 생성 후 호실 배정 (각 유닛별로 2명씩)
  Object.entries(unitStudents).forEach(([unitMentor, unitStudentList]) => {
    const unitIndex = maleUnitMentors.includes(unitMentor) 
      ? maleUnitMentors.indexOf(unitMentor)
      : femaleUnitMentors.indexOf(unitMentor);
    const roomBase = maleUnitMentors.includes(unitMentor) 
      ? 100 + unitIndex * 10 
      : 400 + unitIndex * 10;
    
    // 2명씩 방 배정
    unitStudentList.forEach((student, index) => {
      const roomInUnit = Math.floor(index / 2) + 1;
      student.roomNumber = (roomBase + roomInUnit).toString();
    });
  });
  
  return students;
};

export const stSheetService = {
  getCachedData: async (campCode: CampCode = 'E27'): Promise<STSheetStudent[]> => {
    try {
      // 설정 먼저 확인
      const useTemporaryData = await stSheetService.getUseTemporaryDataSetting(campCode);
      
      // 임시 데이터 사용 설정이 켜져있으면 무조건 임시 데이터 반환
      if (useTemporaryData) {
        logger.info(`⚠️ ${campCode} 임시 데이터 표시 설정이 활성화되어 있습니다.`);
        return getTemporaryData(campCode);
      }
      
      // 임시 데이터 사용 설정이 꺼져있으면 실제 데이터만 반환
      const docRef = doc(db, 'stSheetCache', campCode);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.data || [];
      }
      
      // 실제 데이터도 없으면 빈 배열 반환
      return [];
    } catch (error) {
      logger.error('Firestore 데이터 로드 실패:', error);
      throw error;
    }
  },

  // 임시 데이터 여부 확인
  isTemporaryData: async (campCode: CampCode = 'E27'): Promise<boolean> => {
    try {
      const useTemporaryData = await stSheetService.getUseTemporaryDataSetting(campCode);
      
      // 임시 데이터 사용 설정이 켜져있으면 무조건 true
      if (useTemporaryData) {
        return true;
      }
      
      // 임시 데이터 사용 설정이 꺼져있으면 무조건 false
      return false;
    } catch (error) {
      logger.error('임시 데이터 확인 실패:', error);
      return true;
    }
  },

  // 임시 데이터 사용 설정 가져오기
  getUseTemporaryDataSetting: async (campCode: CampCode = 'E27'): Promise<boolean> => {
    try {
      const docRef = doc(db, 'campSettings', campCode);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data()?.useTemporaryData ?? false;
      }
      
      // 기본값: 실제 데이터가 없으면 임시 데이터 표시, 있으면 실제 데이터 표시
      const hasReal = await stSheetService.hasRealData(campCode);
      return !hasReal; // 실제 데이터가 없으면 true (임시 데이터 표시)
    } catch (error) {
      logger.error('설정 조회 실패:', error);
      return false;
    }
  },

  // 임시 데이터 사용 설정 변경 (관리자만)
  setUseTemporaryDataSetting: async (campCode: CampCode = 'E27', useTemporaryData: boolean): Promise<void> => {
    try {
      const docRef = doc(db, 'campSettings', campCode);
      await setDoc(docRef, {
        campCode,
        useTemporaryData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      logger.error('설정 저장 실패:', error);
      throw error;
    }
  },

  // 실제 데이터 존재 여부 확인 (새로 추가)
  hasRealData: async (campCode: CampCode = 'E27'): Promise<boolean> => {
    try {
      const docRef = doc(db, 'stSheetCache', campCode);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() && docSnap.data()?.data && docSnap.data()?.data.length > 0;
    } catch (error) {
      logger.error('실제 데이터 확인 실패:', error);
      return false;
    }
  },

  // 강제로 임시 데이터 표시 (관리자용)
  getTemporaryDataForced: async (campCode: CampCode = 'E27'): Promise<STSheetStudent[]> => {
    return getTemporaryData(campCode);
  },

  getStudentsByMentor: async (
    mentorName: string,
    filterType: 'class' | 'unit',
    campCode: CampCode = 'E27'
  ): Promise<STSheetStudent[]> => {
    try {
      const students = await stSheetService.getCachedData(campCode);
      
      const filtered = students.filter(student => {
        if (filterType === 'class') {
          return student.classMentor === mentorName;
        } else {
          return student.unitMentor === mentorName;
        }
      });

      return filtered;
    } catch (error) {
      logger.error('학생 목록 조회 실패:', error);
      throw error;
    }
  },

  syncSTSheet: async (campCode: CampCode = 'E27'): Promise<{ success: boolean; count: number; lastSync: string }> => {
    try {
      logger.info(`🔄 ST 시트 전체 데이터 동기화 시작... (캠프: ${campCode})`);

      // Google Sheets에서 전체 데이터 가져오기
      const allStudents = await fetchGoogleSheetsData(campCode);

      logger.info(`✅ 전체 학생: ${allStudents.length}명`);

      // Firestore에 전체 데이터 저장
      const docRef = doc(db, 'stSheetCache', campCode);
      await setDoc(docRef, {
        campCode: campCode,
        data: allStudents,
        lastSyncedAt: new Date().toISOString(),
        syncedBy: 'admin',
        syncedByName: 'Admin User',
        version: Date.now(),
        totalStudents: allStudents.length
      });

      logger.info(`✅ Firestore 저장 완료! (캠프: ${campCode})`);

      return {
        success: true,
        count: allStudents.length,
        lastSync: new Date().toISOString()
      };
    } catch (error) {
      logger.error('동기화 실패:', error);
      throw error;
    }
  },

  getStudentDetail: async (studentId: string, campCode: CampCode = 'E27'): Promise<STSheetStudent | null> => {
    try {
      const students = await stSheetService.getCachedData(campCode);
      const student = students.find(s => s.studentId === studentId);
      return student || null;
    } catch (error) {
      logger.error('학생 상세 정보 조회 실패:', error);
      throw error;
    }
  },

  getCampType: (campCode: CampCode): CampType => {
    const config = CAMP_SHEET_CONFIG[campCode];
    return config?.type || 'EJ';
  },
};

export const jobCodesService = {
  getJobCodesByIds: async (jobExperiences: Array<{ id: string }> | string[]): Promise<JobCode[]> => {
    if (!jobExperiences || jobExperiences.length === 0) {
      return [];
    }

    try {
      const jobCodeIds = jobExperiences.map(exp => 
        typeof exp === 'string' ? exp : exp.id
      );
      
      const validJobCodeIds = jobCodeIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      if (validJobCodeIds.length === 0) {
        return [];
      }
      
      const jobCodes: JobCode[] = [];
      
      const chunks = [];
      for (let i = 0; i < validJobCodeIds.length; i += 10) {
        chunks.push(validJobCodeIds.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const q = query(
          collection(db, 'jobCodes'),
          where('__name__', 'in', chunk)
        );
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          jobCodes.push({
            id: doc.id,
            ...doc.data(),
          } as JobCode);
        });
      }

      return jobCodes;
    } catch (error) {
      logger.error('JobCodes 조회 실패:', error);
      throw error;
    }
  },
};
