import { getFirestore, collection, doc, getDoc, setDoc } from 'firebase/firestore';
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

    console.log(`📊 Google Sheets 데이터 가져오기 시작... (캠프: ${campCode})`);
    console.log('   Spreadsheet ID:', config.spreadsheetId);
    console.log('   Sheet Name:', config.sheetName);
    console.log('   Sheet GID:', config.gid);
    console.log('   Camp Type:', config.type);
    console.log('   Use Header Mapping:', config.useHeaderMapping);

    // 공개 스프레드시트를 TSV 형식으로 가져오기
    const exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=tsv&gid=${config.gid}`;
    
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
    
    // 헤더 기반 매핑을 위한 인덱스 맵 생성
    const headerIndexMap: Record<string, number> = {};
    if (config.useHeaderMapping) {
      headers.forEach((header, index) => {
        const trimmedHeader = header.trim();
        headerIndexMap[trimmedHeader] = index;
        console.log(`   헤더[${index}]: "${trimmedHeader}"`);
      });
    }
    
    const rows = lines.slice(1).map((line: string) => line.split('\t'));
    console.log(`📊 총 ${rows.length}개 행 로드`);

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
          console.log(`   학생 ${index + 1}: ${student.name} | ${student.englishName} | 반멘토: "${student.classMentor}" | 유닛: "${student.unitMentor}"`);
        }

        return student;
      });

    console.log(`✅ ${students.length}명의 학생 데이터 변환 완료`);
    
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
      console.error('❌ Firestore 데이터 로드 실패:', error);
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

      console.log(`✅ ${mentorName} 멘토의 ${filterType} 학생: ${filtered.length}명 (캠프: ${campCode})`);
      return filtered;
    } catch (error) {
      console.error('❌ 학생 목록 조회 실패:', error);
      throw error;
    }
  },

  // Google Sheets에서 실제 데이터 동기화 (모든 행 가져오기 - 관리자용)
  syncSTSheet: async (campCode: CampCode = 'E27'): Promise<SyncSTSheetResponse> => {
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
      console.error('❌ 동기화 실패:', error);
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
      console.error('❌ 학생 상세 정보 조회 실패:', error);
      throw error;
    }
  },

  // 캠프 코드의 타입 가져오기 (EJ or S)
  getCampType: (campCode: CampCode): CampType => {
    const config = CAMP_SHEET_CONFIG[campCode];
    return config?.type || 'EJ';
  },
};
