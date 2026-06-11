import { collection, doc, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  logger,
  STSheetStudent,
  CAMP_SHEET_CONFIG,
  ST_SHEET_HEADER_MAPPING,
  CampCode,
  CampType,
  FamilyUnit,
  FamilySTSheetCache,
} from '@smis-mentor/shared';
import { db, functions } from './firebase';

export type { STSheetStudent, CampCode, CampType, FamilyUnit, FamilySTSheetCache };

export interface JobCode {
  id: string;
  code: string;
  generation: string;
  name: string;
  location?: string;
  korea?: boolean;
}

// shared의 buildNormalizedHeaderIndexMap / mapHeadersToStudent 사용으로 통합됨

// ─── syncSTSheet는 Cloud Function에서 처리 ───────────────────────────────────
// TSV export URL 방식은 비공개 시트에서 동작하지 않으므로,
// 서비스 계정 인증이 된 Cloud Function(syncSTSheet)을 호출한다.

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
      
      const globalStudentIndex = (classIndex - 1) * 10 + studentIndex;
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
        roomNumber: '',
        rowNumber: globalStudentIndex + 1,
        lastSyncedAt: new Date(),
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
    logger.info(`🔄 ST 시트 동기화 요청 → Cloud Function (캠프: ${campCode})`);
    const fn = httpsCallable<{ campCode: string }, { success: boolean; count: number; lastSync: string }>(
      functions,
      'syncSTSheet'
    );
    const result = await fn({ campCode });
    logger.info(`✅ 동기화 완료: ${result.data.count}명`);
    return result.data;
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
    const config = CAMP_SHEET_CONFIG[campCode as keyof typeof CAMP_SHEET_CONFIG];
    return (config?.type as CampType) || 'EJ';
  },

  // F 캠프 가족 데이터 조회
  getCachedFamilies: async (campCode: CampCode): Promise<FamilyUnit[]> => {
    try {
      const docRef = doc(db, 'familySTSheetCache', campCode);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return (docSnap.data()?.families ?? []) as FamilyUnit[];
      }
      return [];
    } catch (error) {
      logger.error('❌ 가족 데이터 로드 실패:', error);
      return [];
    }
  },
};

// ─── 학생 이력 조회 ──────────────────────────────────────

export interface StudentHistoryResult {
  student: STSheetStudent;
  campCode: string;
  /** F타입 가족캠프 여부 */
  isFamily?: boolean;
  /** F타입일 때 소속 가족 정보 */
  familyUnit?: FamilyUnit;
}

/** 캠프코드에서 기수 숫자를 추출하여 정렬키 반환 (J28 → 28, F26_1 → 26.1, J22 → 22) */
export function campSortKey(campCode: string): number {
  const match = campCode.match(/^[A-Za-z]+(\d+)(?:_(\d+))?$/);
  if (!match) return 0;
  const gen = parseInt(match[1], 10);
  const sub = match[2] ? parseInt(match[2], 10) * 0.1 : 0;
  return gen + sub;
}

/**
 * 페이지 진입 시 1회 호출: 전체 stSheetCache + familySTSheetCache를 메모리에 로드.
 * 이후 검색은 filterStudents()로 클라이언트 사이드에서 처리한다.
 */
export async function loadAllStudentRecords(): Promise<StudentHistoryResult[]> {
  const [regularSnap, familySnap] = await Promise.all([
    getDocs(collection(db, 'stSheetCache')),
    getDocs(collection(db, 'familySTSheetCache')),
  ]);

  const records: StudentHistoryResult[] = [];

  regularSnap.forEach((docSnap) => {
    const campCode = docSnap.id;
    const students: STSheetStudent[] = docSnap.data().data || [];
    students.forEach((student) => records.push({ student, campCode }));
  });

  familySnap.forEach((docSnap) => {
    const campCode = docSnap.id;
    const families: FamilyUnit[] = docSnap.data().families || [];
    families.forEach((family) => {
      family.students.forEach((fs) => {
        const student: STSheetStudent = {
          name: fs.name,
          englishName: fs.englishName,
          grade: fs.grade,
          gender: fs.gender,
          ssn: fs.ssn,
          passportName: fs.passportName,
          passportNumber: fs.passportNumber,
          passportExpiry: fs.passportExpiry,
          medication: fs.medication,
          parentPhone: fs.parentPhone || family.parents[0]?.phone,
          registrationSource: fs.registrationSource,
          roomNumber: family.roomNumber,
          studentId: fs.id,
          lastSyncedAt: family.lastSyncedAt,
        } as STSheetStudent;
        records.push({ student, campCode, isFamily: true, familyUnit: family });
      });
    });
  });

  return records;
}

/** 메모리에 올라온 records에서 query로 필터링 (Firestore 호출 없음) */
export function filterStudents(records: StudentHistoryResult[], query: string): StudentHistoryResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const normalizedPhone = trimmed.replace(/-/g, '');

  return records.filter(({ student, familyUnit }) => {
    if (student.name?.includes(trimmed)) return true;
    if (student.parentPhone?.replace(/-/g, '').includes(normalizedPhone)) return true;
    // 가족캠프: 부모 전화번호도 검색
    if (familyUnit?.parents.some((p) => p.phone?.replace(/-/g, '').includes(normalizedPhone))) return true;
    return false;
  });
}

// stSheetCache + familySTSheetCache 전체 캠프를 순회하며 이름 또는 부모님 연락처로 검색
export async function searchStudents(query: string): Promise<StudentHistoryResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const normalizedPhone = trimmed.replace(/-/g, '');

  try {
    const [regularSnap, familySnap] = await Promise.all([
      getDocs(collection(db, 'stSheetCache')),
      getDocs(collection(db, 'familySTSheetCache')),
    ]);

    const results: StudentHistoryResult[] = [];

    // 일반 캠프 (stSheetCache)
    regularSnap.forEach((docSnap) => {
      const campCode = docSnap.id;
      const students: STSheetStudent[] = docSnap.data().data || [];
      students
        .filter((s) =>
          s.name?.includes(trimmed) ||
          s.parentPhone?.replace(/-/g, '').includes(normalizedPhone)
        )
        .forEach((student) => results.push({ student, campCode }));
    });

    // 가족 캠프 (familySTSheetCache)
    familySnap.forEach((docSnap) => {
      const campCode = docSnap.id;
      const families: FamilyUnit[] = docSnap.data().families || [];

      families.forEach((family) => {
        family.students.forEach((fs) => {
          const nameMatch = fs.name?.includes(trimmed);
          const phoneMatch =
            fs.parentPhone?.replace(/-/g, '').includes(normalizedPhone) ||
            family.parents.some((p) => p.phone?.replace(/-/g, '').includes(normalizedPhone));

          if (!nameMatch && !phoneMatch) return;

          // FamilyStudent → STSheetStudent 변환 (공통 필드만 매핑)
          const student: STSheetStudent = {
            name: fs.name,
            englishName: fs.englishName,
            grade: fs.grade,
            gender: fs.gender,
            ssn: fs.ssn,
            passportName: fs.passportName,
            passportNumber: fs.passportNumber,
            passportExpiry: fs.passportExpiry,
            medication: fs.medication,
            parentPhone: fs.parentPhone || family.parents[0]?.phone,
            registrationSource: fs.registrationSource,
            roomNumber: family.roomNumber,
            studentId: fs.id,
            lastSyncedAt: family.lastSyncedAt,
          } as STSheetStudent;

          results.push({ student, campCode, isFamily: true, familyUnit: family });
        });
      });
    });

    return results;
  } catch (error) {
    logger.error('학생 검색 실패:', error);
    throw error;
  }
}

// 동일 학생의 캠프 참여 이력 그룹 (ssn 또는 name+parentPhone 기준)
export interface StudentGroup {
  key: string;                         // 식별 키 (ssn 또는 name:phone)
  name: string;
  grade: string;                       // 가장 최신 캠프 기준 학년
  gender: string;
  parentPhone: string;
  parentName: string;
  age: number | null;                  // 주민번호 기반 한국 나이 (없으면 null)
  schoolGrade: string | null;          // 주민번호 출생연도 기반 현재 학년 (없으면 null)
  ssn: string | null;                  // 나이 계산 원본 보존
  history: Array<{
    campCode: string;
    student: STSheetStudent;
    isFamily?: boolean;
    familyUnit?: FamilyUnit;
  }>;
}

/**
 * 주민번호 앞 6자리(YYMMDD)에서 출생연도를 파싱하는 내부 헬퍼.
 * 1: 남(1900년대), 2: 여(1900년대), 3: 남(2000년대), 4: 여(2000년대)
 */
function parseBirthYearFromSSN(ssn: string): number | null {
  const digits = ssn.replace(/-/g, '');
  if (digits.length < 7) return null;

  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);
  const genderDigit = parseInt(digits[6], 10);

  if (isNaN(yy) || isNaN(mm) || isNaN(dd) || isNaN(genderDigit)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const century = genderDigit <= 2 ? 1900 : 2000;
  return century + yy;
}

/** 주민번호에서 한국 나이 계산 (올해 연도 - 출생연도 + 1, 생일 무관) */
function calcAgeFromSSN(ssn: string): number | null {
  const birthYear = parseBirthYearFromSSN(ssn);
  if (birthYear === null) return null;
  const age = new Date().getFullYear() - birthYear + 1;
  return age > 0 && age < 130 ? age : null;
}

/**
 * 주민번호 출생연도에서 현재 학년을 계산.
 * 한국 나이 기준: 한국 나이 8세에 초1 입학
 * 공식: schoolYear = 한국 나이 - 7 = (현재연도 - 출생연도 + 1) - 7 = 현재연도 - 출생연도 - 6
 */
function calcGradeFromSSN(ssn: string): string | null {
  const birthYear = parseBirthYearFromSSN(ssn);
  if (birthYear === null) return null;
  const schoolYear = new Date().getFullYear() - birthYear - 6;
  if (schoolYear < 1 || schoolYear > 12) return null;
  if (schoolYear <= 6) return `초${schoolYear}`;
  if (schoolYear <= 9) return `중${schoolYear - 6}`;
  return `고${schoolYear - 9}`;
}

export function groupStudentResults(results: StudentHistoryResult[]): StudentGroup[] {
  const map = new Map<string, StudentGroup>();

  results.forEach(({ student, campCode, isFamily, familyUnit }) => {
    // ssn은 하이픈 제거 후 정규화 (980619-1234567 == 9806191234567)
    const normalizedSsn = student.ssn ? student.ssn.replace(/-/g, '') : null;
    const key = normalizedSsn
      ? `ssn:${normalizedSsn}`
      : `name:${student.name}:phone:${(student.parentPhone || '').replace(/-/g, '')}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: student.name || '',
        grade: student.grade || '',
        gender: student.gender || '',
        parentPhone: student.parentPhone || '',
        parentName: student.parentName || '',
        age: student.ssn ? calcAgeFromSSN(student.ssn) : null,
        schoolGrade: student.ssn ? calcGradeFromSSN(student.ssn) : null,
        ssn: student.ssn || null,
        history: [],
      });
    } else {
      // ssn이 나중에 발견될 수도 있으므로 업데이트
      const g = map.get(key)!;
      if (!g.ssn && student.ssn) {
        g.ssn = student.ssn;
        g.age = calcAgeFromSSN(student.ssn);
        g.schoolGrade = calcGradeFromSSN(student.ssn);
      }
    }

    const group = map.get(key)!;
    const existingIdx = group.history.findIndex((h) => h.campCode === campCode);
    if (existingIdx === -1) {
      group.history.push({ campCode, student, isFamily, familyUnit });
    } else if (isFamily && !group.history[existingIdx].isFamily) {
      // 가족 캠프 데이터가 더 풍부하므로 일반 항목을 교체
      group.history[existingIdx] = { campCode, student, isFamily, familyUnit };
    }
  });

  // 이력을 기수 숫자 기준 내림차순 정렬 후 → 가장 최신 캠프 학년으로 업데이트
  map.forEach((group) => {
    group.history.sort((a, b) => campSortKey(b.campCode) - campSortKey(a.campCode));
    // 최신 캠프의 학년으로 덮어쓰기
    const latestGrade = group.history[0]?.student.grade;
    if (latestGrade) group.grade = latestGrade;
  });

  return Array.from(map.values());
}

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
