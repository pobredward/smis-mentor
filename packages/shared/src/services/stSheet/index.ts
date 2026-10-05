/**
 * 학생 명단 읽기 — web·mobile 공용
 * SMIS CAMP 1.0 부터 구글 시트 연동이 없다. 원본은 아이(children) · 캠프 참가(camps/{캠프}/enrollments) 이고,
 * 화면은 서버가 만들어 두는 목록용 명단(camps/{캠프}/roster/current) 하나만 읽는다 (가족 캠프도 같은 문서의 families).
 * 한 학생의 상세(설문 · 레벨 테스트 · 상담 · 주소 · 여권 · 특이사항)는 참가 + 아이 문서를 합쳐 읽는다.
 * 쓰기는 모두 서버 API (/api/st/update-placement, /api/admin/camp-students …).
 */
import { type Firestore, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import type { STSheetStudent, CampCode, CampType, FamilyUnit } from '../../types/student';
import {
  CAMPS_COLLECTION, CHILDREN_COLLECTION, ENROLLMENTS_SUBCOLLECTION, ROSTER_SUBCOLLECTION, ROSTER_DOC_ID,
  type CampEnrollment, type StudentRosterDoc, type ChildProfile,
} from '../../types/campStudent';
import { toCampStudent, campTypeOfCode } from '../../utils/campStudent';
import { logger } from '../../utils/logger';
import type { StudentDetailDoc } from '../../utils/studentRecordSplit';

const rosterDocRef = (db: Firestore, campCode: string) => doc(db, CAMPS_COLLECTION, campCode, ROSTER_SUBCOLLECTION, ROSTER_DOC_ID);

async function readRoster(db: Firestore, campCode: string): Promise<StudentRosterDoc | null> {
  const snap = await getDoc(rosterDocRef(db, campCode));
  return snap.exists() ? (snap.data() as StudentRosterDoc) : null;
}

export function createStSheetService(db: Firestore) {
  const service = {
    /**
     * 학생 명단 — camps/{캠프}/roster/current 한 문서 (확정된 학생, 참가 순서).
     * 명단이 아직 없으면 빈 목록. 읽기 실패는 그대로 던진다 → 화면이 오류/빈 상태를 보여 준다.
     */
    getCachedData: async (campCode: CampCode = 'E27'): Promise<STSheetStudent[]> => {
      const roster = await readRoster(db, campCode);
      return Array.isArray(roster?.students) ? roster!.students : [];
    },

    getStudentsByMentor: async (
      mentorName: string,
      filterType: 'class' | 'unit',
      campCode: CampCode = 'E27'
    ): Promise<STSheetStudent[]> => {
      try {
        const students = await service.getCachedData(campCode);
        return students.filter(student =>
          filterType === 'class' ? student.classMentor === mentorName : student.unitMentor === mentorName,
        );
      } catch (error) {
        logger.error('학생 목록 조회 실패:', error);
        throw error;
      }
    },

    getStudentDetail: async (studentId: string, campCode: CampCode = 'E27'): Promise<STSheetStudent | null> => {
      try {
        const students = await service.getCachedData(campCode);
        const student = students.find(s => s.studentId === studentId);
        if (!student) return null;
        const detail = await service.getStudentDetailFields(campCode, student);
        return detail ? ({ ...student, ...detail } as STSheetStudent) : student;
      } catch (error) {
        logger.error('학생 상세 정보 조회 실패:', error);
        throw error;
      }
    },

    /**
     * 한 학생 전체 (상세 칸 포함) — 캠프 참가 + 아이 문서를 합친다. 참가 문서가 없으면 null.
     * 목록 항목에 childId 가 있으면 두 문서를 함께 읽는다.
     */
    getStudentDetailFields: async (
      campCode: string,
      student: Pick<STSheetStudent, 'studentId'> & { childId?: string },
    ): Promise<StudentDetailDoc | null> => {
      if (!student.studentId) return null;
      const enrRef = doc(db, CAMPS_COLLECTION, campCode, ENROLLMENTS_SUBCOLLECTION, student.studentId);
      const [enrSnap, childSnap0] = await Promise.all([
        getDoc(enrRef),
        student.childId ? getDoc(doc(db, CHILDREN_COLLECTION, student.childId)) : Promise.resolve(null),
      ]);
      if (!enrSnap.exists()) return null;
      const enr = { ...(enrSnap.data() as CampEnrollment), studentId: enrSnap.id };
      const childSnap = childSnap0 ?? (enr.childId ? await getDoc(doc(db, CHILDREN_COLLECTION, enr.childId)) : null);
      const child = childSnap?.exists() ? ({ ...(childSnap.data() as ChildProfile), childId: childSnap.id }) : null;
      return toCampStudent(child, enr) as unknown as StudentDetailDoc;
    },

    getCampType: (campCode: CampCode): CampType => campTypeOfCode(campCode),

    /** 가족 캠프 — 목록용 명단의 families (예전 familySTSheetCache 와 같은 모양) */
    getCachedFamilies: async (campCode: CampCode): Promise<FamilyUnit[]> => {
      try {
        const roster = await readRoster(db, campCode);
        return Array.isArray(roster?.families) ? roster!.families : [];
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
    // 같은 아이는 childId 하나로 묶는다 (이관 때 이름 + 보호자 번호로 묶어 둠).
    // 없으면 예전처럼: 가린 주민번호("YYMMDD-G******")는 생년월일·성별이 같은 다른 학생과 섞이지 않게 이름을 함께 쓴다
    const childId = (student as { childId?: string }).childId;
    const key = childId ? `child:${childId}` : normalizedSsn
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
   * 페이지 진입 시 1회 호출: 모든 캠프의 목록용 명단(camps/{캠프}/roster/current)을 메모리에 로드.
   * 이후 검색은 filterStudents()로 클라이언트 사이드에서 처리한다.
   */
  async function loadAllStudentRecords(): Promise<StudentHistoryResult[]> {
    const snap = await getDocs(collectionGroup(db, ROSTER_SUBCOLLECTION));
    const records: StudentHistoryResult[] = [];
    snap.forEach((docSnap) => {
      if (docSnap.id !== ROSTER_DOC_ID) return;
      const roster = docSnap.data() as StudentRosterDoc;
      const campCode = roster.campCode || docSnap.ref.parent.parent?.id || '';
      if (!campCode) return;
      const families = new Map((roster.families ?? []).map((f) => [f.familyId, f] as const));
      for (const student of roster.students ?? []) {
        const familyId = (student as { familyId?: string }).familyId;
        const familyUnit = familyId ? families.get(familyId) : undefined;
        records.push(familyUnit ? { student, campCode, isFamily: true, familyUnit } : { student, campCode });
      }
    });
    return records;
  }
  return loadAllStudentRecords;
}
