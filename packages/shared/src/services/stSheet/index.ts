/**
 * ST 시트(학생 명단) 캐시 읽기 — web·mobile 공용
 * 예전에는 모바일 사본이 가족(F) 캠프를 모르고(stSheetCache 만 봄), 데이터가 없으면 가짜 학생으로 채웠다.
 * 이제 웹과 같이: F 캠프는 familySTSheetCache, 실제 데이터 없으면 빈 목록.
 * 임시(샘플) 학생 기능(campSettings.useTemporaryData)은 없앴다 — 명단을 열 때 campSettings 를 읽지 않는다.
 */
import { type Firestore, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import type { STSheetStudent, CampCode, CampType, FamilyUnit } from '../../types/student';
import { CAMP_SHEET_CONFIG } from '../../types/student';
import { logger } from '../../utils/logger';

export interface SyncSTSheetResponse {
  success: boolean;
  count: number;
  familyCount?: number;
  lastSync: string;
}

export function createStSheetService(db: Firestore, opts: { sync: (campCode: CampCode) => Promise<SyncSTSheetResponse> }) {
  const service = {
    /**
     * 학생 명단 — 캐시 문서 하나만 읽는다 (F 캠프는 familySTSheetCache, 그 외 stSheetCache).
     * 캐시가 없으면 빈 목록. 읽기 실패는 그대로 던진다 → 화면이 오류/빈 상태를 보여 준다.
     */
    getCachedData: async (campCode: CampCode = 'E27'): Promise<STSheetStudent[]> => {
      const config = CAMP_SHEET_CONFIG[campCode];
      const isFamily = config?.type === 'F';

      // F캠프: familySTSheetCache에서 읽어 STSheetStudent[] 형태로 변환
      if (isFamily) {
        const familyCacheSnap = await getDoc(doc(db, 'familySTSheetCache', campCode));
        if (!familyCacheSnap.exists()) return [];
        const families: FamilyUnit[] = familyCacheSnap.data()?.families ?? [];
        // FamilyUnit의 학생들을 STSheetStudent 형태로 평탄화
        const students: STSheetStudent[] = families.flatMap((family) =>
          family.students.map((fs) => ({
            studentId: fs.id,
            name: fs.name,
            englishName: fs.englishName ?? '',
            grade: fs.grade,
            gender: fs.gender,
            ssn: fs.ssn ?? '',
            passportName: fs.passportName ?? '',
            passportNumber: fs.passportNumber ?? '',
            passportExpiry: fs.passportExpiry ?? '',
            medication: fs.medication ?? '',
            parentPhone: fs.parentPhone ?? (family.parents[0]?.phone ?? ''),
            registrationSource: fs.registrationSource ?? '',
            classMentor: fs.classMentor ?? '',
            classNumber: fs.classNumber ?? '',
            className: fs.className ?? '',
            roomNumber: family.roomNumber ?? '',
            familyId: family.familyId,
            familyType: family.familyType,
          } as STSheetStudent & { familyId: string; familyType: string; classNumber: string; className: string })
        ));
        logger.info(`📦 [F캠프] familySTSheetCache → ${students.length}명 변환 완료`);
        return students;
      }

      // 일반 캠프: stSheetCache 만 읽는다. 실제 캐시가 없으면 빈 배열 (빈 화면 표시)
      const cacheSnap = await getDoc(doc(db, 'stSheetCache', campCode));
      const data = cacheSnap.exists() ? cacheSnap.data()?.data : undefined;
      return Array.isArray(data) ? (data as STSheetStudent[]) : [];
    },

    getStudentsByMentor: async (
      mentorName: string,
      filterType: 'class' | 'unit',
      campCode: CampCode = 'E27'
    ): Promise<STSheetStudent[]> => {
      try {
        const students = await service.getCachedData(campCode);
      
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

    /** 시트 동기화는 서버(/api/st/sync-sheet)가 한다 — 호출 방식이 앱마다 달라 주입받는다 */
    syncSTSheet: async (campCode: CampCode = 'E27'): Promise<SyncSTSheetResponse> => {
      logger.info(`🔄 ST 시트 동기화 요청 (캠프: ${campCode})`);
      const result = await opts.sync(campCode);
      logger.info(`✅ 동기화 완료: ${result.count}명`);
      return result;
    },

    getStudentDetail: async (studentId: string, campCode: CampCode = 'E27'): Promise<STSheetStudent | null> => {
      try {
        const students = await service.getCachedData(campCode);
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
  return service;
}

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
    // 캐시의 주민번호는 뒷자리가 가려져 있으므로("YYMMDD-G******") 생년월일·성별이 같은 다른 학생과 섞이지 않게 이름을 함께 쓴다
    const key = normalizedSsn
      ? (normalizedSsn.includes('*') ? `ssn:${normalizedSsn}:name:${student.name}` : `ssn:${normalizedSsn}`)
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

/** 전체 캠프 학생 기록 (학생 검색용) — 페이지 진입 시 1회 */
export function createStudentHistoryLoader(db: Firestore) {
  /**
   * 페이지 진입 시 1회 호출: 전체 stSheetCache + familySTSheetCache를 메모리에 로드.
   * 이후 검색은 filterStudents()로 클라이언트 사이드에서 처리한다.
   */
  async function loadAllStudentRecords(): Promise<StudentHistoryResult[]> {
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
  return loadAllStudentRecords;
}
