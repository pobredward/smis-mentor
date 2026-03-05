import { getFirestore, collection, doc, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
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
};

// Google Sheets에서 데이터 가져오기
const fetchGoogleSheetsData = async (campCode: CampCode): Promise<STSheetStudent[]> => {
  try {
    const config = CAMP_SHEET_CONFIG[campCode];
    if (!config) {
      throw new Error(`캠프 코드 ${campCode}에 대한 설정을 찾을 수 없습니다.`);
    }

    console.log(`📊 Google Sheets 데이터 가져오기 시작... (캠프: ${campCode})`);
    
    const exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=tsv&gid=${config.gid}`;
    
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const tsvData = await response.text();
    
    const lines = tsvData.split('\n').filter((line: string) => line.trim());
    const headers = lines[0].split('\t');
    console.log(`📋 헤더 ${headers.length}개 로드`);
    
    const headerIndexMap: Record<string, number> = {};
    if (config.useHeaderMapping) {
      headers.forEach((header, index) => {
        const trimmedHeader = header.trim();
        headerIndexMap[trimmedHeader] = index;
      });
    }
    
    const rows = lines.slice(1).map((line: string) => line.split('\t'));
    console.log(`📊 총 ${rows.length}개 행 로드`);

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
          rowNumber: index + 2,
          lastSyncedAt: new Date(),
          displayFields: {}
        };

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

    console.log(`✅ ${students.length}명의 학생 데이터 변환 완료`);
    return students;
  } catch (error) {
    console.error('❌ Google Sheets 데이터 가져오기 실패:', error);
    throw error;
  }
};

export const stSheetService = {
  getCachedData: async (campCode: CampCode = 'E27'): Promise<STSheetStudent[]> => {
    try {
      const docRef = doc(db, 'stSheetCache', campCode);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('Firestore 데이터 로드 실패:', error);
      throw error;
    }
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
      console.error('학생 목록 조회 실패:', error);
      throw error;
    }
  },

  syncSTSheet: async (campCode: CampCode = 'E27'): Promise<{ success: boolean; count: number; lastSync: string }> => {
    try {
      console.log(`🔄 ST 시트 전체 데이터 동기화 시작... (캠프: ${campCode})`);

      // Google Sheets에서 전체 데이터 가져오기
      const allStudents = await fetchGoogleSheetsData(campCode);

      console.log(`✅ 전체 학생: ${allStudents.length}명`);

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

      console.log(`✅ Firestore 저장 완료! (캠프: ${campCode})`);

      return {
        success: true,
        count: allStudents.length,
        lastSync: new Date().toISOString()
      };
    } catch (error) {
      console.error('동기화 실패:', error);
      throw error;
    }
  },

  getStudentDetail: async (studentId: string, campCode: CampCode = 'E27'): Promise<STSheetStudent | null> => {
    try {
      const students = await stSheetService.getCachedData(campCode);
      const student = students.find(s => s.studentId === studentId);
      return student || null;
    } catch (error) {
      console.error('학생 상세 정보 조회 실패:', error);
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
      console.error('JobCodes 조회 실패:', error);
      throw error;
    }
  },
};
