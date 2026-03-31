import { getFirestore, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { logger } from '@smis-mentor/shared';
import { app } from '../config/firebase';
import { STSheetStudent, ST_SHEET_COLUMNS, ST_SHEET_HEADER_MAPPING, CAMP_SHEET_CONFIG, CampCode, CampType } from '@smis-mentor/shared';

const db = getFirestore(app);

export interface GetStudentsByMentorRequest {
  mentorName: string;
  filterType: 'class' | 'unit';
}

export interface GetStudentsByMentorResponse {
  students: STSheetStudent[];
  lastSync: string;
  mentorName: string;
}

export interface SyncSTSheetResponse {
  success: boolean;
  count: number;
  lastSync: string;
}

// 컬럼 레터를 인덱스로 변환
const getColumnIndex = (columnLetter: string): number => {
  let index = 0;
  for (let i = 0; i < columnLetter.length; i++) {
    index = index * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1;
};

// Google Sheets에서 데이터 가져오기
const fetchGoogleSheetsData = async (campCode: CampCode): Promise<STSheetStudent[]> => {
  try {
    const config = CAMP_SHEET_CONFIG[campCode];
    if (!config) {
      throw new Error(`캠프 코드 ${campCode}에 대한 설정을 찾을 수 없습니다.`);
    }

    logger.info(`📊 Google Sheets 데이터 가져오기 시작... (캠프: ${campCode})`);
    logger.info('   Spreadsheet ID:', config.spreadsheetId);
    logger.info('   Sheet Name:', config.sheetName);
    logger.info('   Sheet GID:', config.gid);
    logger.info('   Camp Type:', config.type);
    logger.info('   Use Header Mapping:', config.useHeaderMapping);

    // 공개 스프레드시트를 TSV 형식으로 가져오기
    const exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=tsv&gid=${config.gid}`;
    
    logger.info('   Export URL:', exportUrl);
    
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const tsvData = await response.text();
    
    // TSV 파싱
    const lines = tsvData.split('\n').filter((line: string) => line.trim());
    const headers = lines[0].split('\t');
    logger.info(`📋 헤더 ${headers.length}개 로드`);
    
    // 헤더 기반 매핑을 위한 인덱스 맵 생성
    const headerIndexMap: Record<string, number> = {};
    if (config.useHeaderMapping) {
      headers.forEach((header, index) => {
        const trimmedHeader = header.trim();
        headerIndexMap[trimmedHeader] = index;
        logger.info(`   헤더[${index}]: "${trimmedHeader}"`);
      });
    }
    
    const rows = lines.slice(1).map((line: string) => line.split('\t'));
    logger.info(`📊 총 ${rows.length}개 행 로드`);

    // 각 행을 STSheetStudent 객체로 변환
    const students: STSheetStudent[] = rows
      .filter((row: any[]) => {
        // 첫 번째 셀이 있는 행만 (고유번호가 있는 행)
        return row[0] && row[0].trim();
      })
      .map((row: any[], index: number) => {
        // 헤더 매핑 또는 고정 컬럼 레터 사용
        const getValue = (headerName: string, columnLetter?: string): string => {
          if (config.useHeaderMapping) {
            // 헤더 이름으로 매핑
            const colIndex = headerIndexMap[headerName];
            if (colIndex !== undefined) {
              return row[colIndex]?.trim() || '';
            }
            return '';
          } else {
            // 고정 컬럼 레터 사용
            if (!columnLetter) return '';
            const idx = getColumnIndex(columnLetter);
            return row[idx]?.trim() || '';
          }
        };

        const student: STSheetStudent = {
          // 기본 정보
          studentId: getValue('고유번호', ST_SHEET_COLUMNS.STUDENT_ID),
          name: getValue('학생 이름', ST_SHEET_COLUMNS.NAME),
          englishName: getValue('영어 닉네임', ST_SHEET_COLUMNS.ENGLISH_NAME),
          grade: getValue('학년', ST_SHEET_COLUMNS.GRADE),
          gender: (getValue('성별', ST_SHEET_COLUMNS.GENDER) || 'M') as 'M' | 'F',

          // 연락처
          parentPhone: getValue('부모님 연락처', ST_SHEET_COLUMNS.PARENT_PHONE),
          parentName: getValue('부모님 성함', ST_SHEET_COLUMNS.PARENT_NAME),
          otherPhone: getValue('기타 연락처', ST_SHEET_COLUMNS.OTHER_PHONE),
          otherName: getValue('기타 연락처 성함', ST_SHEET_COLUMNS.OTHER_NAME),
          medication: getValue('복용약 & 알레르기', ST_SHEET_COLUMNS.MEDICATION),
          notes: getValue('특이사항', ST_SHEET_COLUMNS.NOTES),

          // 개인정보
          ssn: getValue('주민등록번호', ST_SHEET_COLUMNS.SSN),
          region: getValue('지역', ST_SHEET_COLUMNS.REGION),
          address: getValue('도로명 주소', ST_SHEET_COLUMNS.ADDRESS),
          addressDetail: getValue('세부 주소', ST_SHEET_COLUMNS.ADDRESS_DETAIL),
          email: getValue('이메일 주소', ST_SHEET_COLUMNS.EMAIL),

          // 기타
          etc: getValue('기타', ST_SHEET_COLUMNS.ETC),

          // ⭐️ 멘토 및 반 배정
          classNumber: getValue('반번호', ST_SHEET_COLUMNS.CLASS_NUMBER),
          className: getValue('반이름', ST_SHEET_COLUMNS.CLASS_NAME),
          classMentor: getValue('반멘토', ST_SHEET_COLUMNS.CLASS_MENTOR),
          unitMentor: getValue('유닛', ST_SHEET_COLUMNS.UNIT_MENTOR), // 모든 캠프에서 "유닛" 컬럼 사용
          roomNumber: getValue('호수', ST_SHEET_COLUMNS.ROOM_NUMBER),
          
          // 프로필
          profilePhoto: getValue('프로필사진'),

          // 메타
          rowNumber: index + 2,
          lastSyncedAt: new Date(),
          displayFields: {}
        };

        // 캠프 타입별 추가 필드
        if (config.type === 'EJ') {
          // E/J 캠프: 입소여정/퇴소여정
          student.departureRoute = getValue('입소여정', ST_SHEET_COLUMNS.DEPARTURE_ROUTE);
          student.arrivalRoute = getValue('퇴소여정', ST_SHEET_COLUMNS.ARRIVAL_ROUTE);
        } else if (config.type === 'S') {
          // S 캠프: 단체티/여권정보
          student.shirtSize = getValue('단체티', ST_SHEET_COLUMNS.SHIRT_SIZE);
          student.passportName = getValue('여권상 영문이름', ST_SHEET_COLUMNS.PASSPORT_NAME);
          student.passportNumber = getValue('여권 번호', ST_SHEET_COLUMNS.PASSPORT_NUMBER);
          student.passportExpiry = getValue('여권 만료일자', ST_SHEET_COLUMNS.PASSPORT_EXPIRY);
        }
        
        // 모든 캠프에서 "유닛" 컬럼을 unit 필드에도 저장
        student.unit = getValue('유닛', ST_SHEET_COLUMNS.UNIT);

        // 디버깅: 첫 5명의 정보 출력
        if (index < 5) {
          logger.info(`   학생 ${index + 1}: ${student.name} | ${student.englishName} | 반멘토: "${student.classMentor}" | 유닛: "${student.unitMentor}"`);
        }

        return student;
      });

    logger.info(`✅ ${students.length}명의 학생 데이터 변환 완료`);
    
    return students;
  } catch (error) {
    logger.error('❌ Google Sheets 데이터 가져오기 실패:', error);
    if (error instanceof Error) {
      logger.error('   에러 메시지:', error.message);
    }
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
  // Firestore에서 캐시된 데이터 가져오기
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
      logger.error('❌ Firestore 데이터 로드 실패:', error);
      throw error;
    }
  },

  // 멘토별 학생 조회
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

      logger.info(`✅ ${mentorName} 멘토의 ${filterType} 학생: ${filtered.length}명 (캠프: ${campCode})`);
      return filtered;
    } catch (error) {
      logger.error('❌ 학생 목록 조회 실패:', error);
      throw error;
    }
  },

  // Google Sheets에서 실제 데이터 동기화 (모든 행 가져오기 - 관리자용)
  syncSTSheet: async (campCode: CampCode = 'E27'): Promise<SyncSTSheetResponse> => {
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
      logger.error('❌ 동기화 실패:', error);
      throw error;
    }
  },

  // 학생 상세 정보 조회
  getStudentDetail: async (studentId: string, campCode: CampCode = 'E27'): Promise<STSheetStudent | null> => {
    try {
      const students = await stSheetService.getCachedData(campCode);
      const student = students.find(s => s.studentId === studentId);
      return student || null;
    } catch (error) {
      logger.error('❌ 학생 상세 정보 조회 실패:', error);
      throw error;
    }
  },

  // 캠프 코드의 타입 가져오기 (EJ or S)
  getCampType: (campCode: CampCode): CampType => {
    const config = CAMP_SHEET_CONFIG[campCode];
    return config?.type || 'EJ';
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

  // 실제 데이터 존재 여부 확인
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
};
