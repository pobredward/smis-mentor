import { getFirestore, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { app } from '../config/firebase';
import { STSheetStudent, ST_SHEET_COLUMNS } from '@smis-mentor/shared';

const db = getFirestore(app);

// Google Sheets API 설정
const SPREADSHEET_ID = '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8';
const SHEET_NAME = 'ST';
// API Key를 사용하지 않고 공개 스프레드시트로 접근

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
const fetchGoogleSheetsData = async (): Promise<STSheetStudent[]> => {
  try {
    console.log('📊 Google Sheets 데이터 가져오기 시작...');
    console.log('   Spreadsheet ID:', SPREADSHEET_ID);
    console.log('   Sheet Name:', SHEET_NAME);

    // 공개 스프레드시트를 CSV 형식으로 가져오기 (API Key 불필요)
    // 전체 시트를 TSV 형식으로 export
    const exportUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=tsv&gid=0`;
    
    console.log('   Export URL:', exportUrl);
    
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const tsvData = await response.text();
    
    // TSV 파싱
    const lines = tsvData.split('\n').filter((line: string) => line.trim());
    const headers = lines[0].split('\t');
    console.log(`📋 헤더 ${headers.length}개 로드`);
    
    const rows = lines.slice(1).map((line: string) => line.split('\t'));
    console.log(`📊 총 ${rows.length}개 행 로드`);

    // 각 행을 STSheetStudent 객체로 변환
    const students: STSheetStudent[] = rows
      .filter((row: any[]) => row[0]) // A열(고유번호)이 있는 행만
      .map((row: any[], index: number) => {
        const getValue = (columnLetter: string): string => {
          const idx = getColumnIndex(columnLetter);
          return row[idx] || '';
        };

        const student = {
          // 기본 정보
          studentId: getValue(ST_SHEET_COLUMNS.STUDENT_ID),
          name: getValue(ST_SHEET_COLUMNS.NAME),
          englishName: getValue(ST_SHEET_COLUMNS.ENGLISH_NAME),
          grade: getValue(ST_SHEET_COLUMNS.GRADE),
          gender: (getValue(ST_SHEET_COLUMNS.GENDER) || 'M') as 'M' | 'F',

          // 연락처
          parentPhone: getValue(ST_SHEET_COLUMNS.PARENT_PHONE),
          parentName: getValue(ST_SHEET_COLUMNS.PARENT_NAME),
          otherPhone: getValue(ST_SHEET_COLUMNS.OTHER_PHONE),
          otherName: getValue(ST_SHEET_COLUMNS.OTHER_NAME),
          medication: getValue(ST_SHEET_COLUMNS.MEDICATION),
          notes: getValue(ST_SHEET_COLUMNS.NOTES),

          // 개인정보
          ssn: getValue(ST_SHEET_COLUMNS.SSN),
          region: getValue(ST_SHEET_COLUMNS.REGION),
          address: getValue(ST_SHEET_COLUMNS.ADDRESS),
          addressDetail: getValue(ST_SHEET_COLUMNS.ADDRESS_DETAIL),
          email: getValue(ST_SHEET_COLUMNS.EMAIL),

          // ⭐️ 멘토 및 반 배정
          classNumber: getValue(ST_SHEET_COLUMNS.CLASS_NUMBER),
          className: getValue(ST_SHEET_COLUMNS.CLASS_NAME),
          classMentor: getValue(ST_SHEET_COLUMNS.CLASS_MENTOR),
          unitMentor: getValue(ST_SHEET_COLUMNS.UNIT_MENTOR),
          roomNumber: getValue(ST_SHEET_COLUMNS.ROOM_NUMBER),

          // 메타
          rowNumber: index + 2,
          lastSyncedAt: new Date(),
          displayFields: {}
        };

        // 디버깅: 첫 5명의 멘토 정보 출력
        if (index < 5) {
          console.log(`   학생 ${index + 1}: ${student.name} - 반멘토: "${student.classMentor}" (컬럼 인덱스: ${getColumnIndex(ST_SHEET_COLUMNS.CLASS_MENTOR)})`);
        }

        return student;
      });

    console.log(`✅ ${students.length}명의 학생 데이터 변환 완료`);
    
    // 이겸수 멘토 필터링 디버깅
    const gyeomsuStudents = students.filter(s => s.classMentor === '이겸수');
    console.log(`🔍 "이겸수" 멘토 학생: ${gyeomsuStudents.length}명`);
    
    return students;
  } catch (error) {
    console.error('❌ Google Sheets 데이터 가져오기 실패:', error);
    if (error instanceof Error) {
      console.error('   에러 메시지:', error.message);
    }
    throw error;
  }
};

export const stSheetService = {
  // Firestore에서 캐시된 데이터 가져오기
  getCachedData: async (campCode: string = 'E27'): Promise<STSheetStudent[]> => {
    try {
      const docRef = doc(db, 'stSheetCache', campCode);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('❌ Firestore 데이터 로드 실패:', error);
      throw error;
    }
  },

  // 멘토별 학생 조회
  getStudentsByMentor: async (
    mentorName: string,
    filterType: 'class' | 'unit',
    campCode: string = 'E27'
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

      console.log(`✅ ${mentorName} 멘토의 ${filterType} 학생: ${filtered.length}명 (캠프: ${campCode})`);
      return filtered;
    } catch (error) {
      console.error('❌ 학생 목록 조회 실패:', error);
      throw error;
    }
  },

  // Google Sheets에서 실제 데이터 동기화 (모든 행 가져오기 - 관리자용)
  syncSTSheet: async (campCode: string = 'E27'): Promise<SyncSTSheetResponse> => {
    try {
      console.log(`🔄 ST 시트 전체 데이터 동기화 시작... (캠프: ${campCode})`);

      // Google Sheets에서 전체 데이터 가져오기
      const allStudents = await fetchGoogleSheetsData();

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
      console.error('❌ 동기화 실패:', error);
      throw error;
    }
  },

  // 학생 상세 정보 조회
  getStudentDetail: async (studentId: string, campCode: string = 'E27'): Promise<STSheetStudent | null> => {
    try {
      const students = await stSheetService.getCachedData(campCode);
      const student = students.find(s => s.studentId === studentId);
      return student || null;
    } catch (error) {
      console.error('❌ 학생 상세 정보 조회 실패:', error);
      throw error;
    }
  },
};
