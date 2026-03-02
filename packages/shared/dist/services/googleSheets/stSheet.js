"use strict";
// Google Sheets API 서비스
Object.defineProperty(exports, "__esModule", { value: true });
exports.STSheetService = void 0;
const googleapis_1 = require("googleapis");
const types_1 = require("../../types");
class STSheetService {
    constructor(serviceAccountKey) {
        this.spreadsheetId = '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8';
        this.sheetName = 'ST';
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials: serviceAccountKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        this.sheets = googleapis_1.google.sheets({ version: 'v4', auth });
    }
    /**
     * 전체 ST시트 데이터 가져오기
     */
    async fetchAllStudents() {
        try {
            console.log('📊 ST시트 데이터 가져오기 시작...');
            // 헤더 행 가져오기 (1행)
            const headerResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A1:BE1`
            });
            const headers = headerResponse.data.values?.[0] || [];
            console.log(`📋 헤더 ${headers.length}개 로드`);
            // 데이터 행 가져오기 (2행부터)
            const dataResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A2:BE`
            });
            const rows = dataResponse.data.values || [];
            console.log(`📊 총 ${rows.length}개 행 로드`);
            // 각 행을 STSheetStudent 객체로 변환
            const students = rows
                .filter(row => row[0]) // A열(고유번호)이 있는 행만
                .map((row, index) => this.mapRowToStudent(row, headers, index + 2));
            console.log(`✅ ${students.length}명의 학생 데이터 변환 완료`);
            return students;
        }
        catch (error) {
            console.error('❌ ST시트 데이터 가져오기 실패:', error);
            throw error;
        }
    }
    /**
     * 특정 멘토의 학생만 필터링하여 가져오기
     */
    async fetchStudentsByMentor(mentorName, filterType) {
        const allStudents = await this.fetchAllStudents();
        const filtered = allStudents.filter(student => {
            if (filterType === 'class') {
                return student.classMentor === mentorName;
            }
            else {
                return student.unitMentor === mentorName;
            }
        });
        console.log(`✅ ${mentorName} 멘토의 ${filterType} 학생: ${filtered.length}명`);
        return filtered;
    }
    /**
     * 멘토 목록 추출 (중복 제거)
     */
    async getMentorList() {
        const students = await this.fetchAllStudents();
        const classMentors = [...new Set(students.map(s => s.classMentor).filter(Boolean))].sort();
        const unitMentors = [...new Set(students.map(s => s.unitMentor).filter(Boolean))].sort();
        const allMentors = [...new Set([...classMentors, ...unitMentors])].sort();
        return { classMentors, unitMentors, allMentors };
    }
    /**
     * 행 데이터를 STSheetStudent 객체로 변환
     */
    mapRowToStudent(row, headers, rowNumber) {
        const getColumnIndex = (columnLetter) => {
            let index = 0;
            for (let i = 0; i < columnLetter.length; i++) {
                index = index * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
            }
            return index - 1;
        };
        const getValue = (columnLetter) => {
            const index = getColumnIndex(columnLetter);
            return row[index] || '';
        };
        return {
            // 기본 정보
            studentId: getValue(types_1.ST_SHEET_COLUMNS.STUDENT_ID),
            name: getValue(types_1.ST_SHEET_COLUMNS.NAME),
            englishName: getValue(types_1.ST_SHEET_COLUMNS.ENGLISH_NAME),
            grade: getValue(types_1.ST_SHEET_COLUMNS.GRADE),
            gender: getValue(types_1.ST_SHEET_COLUMNS.GENDER),
            // 연락처
            parentPhone: getValue(types_1.ST_SHEET_COLUMNS.PARENT_PHONE),
            parentName: getValue(types_1.ST_SHEET_COLUMNS.PARENT_NAME),
            otherPhone: getValue(types_1.ST_SHEET_COLUMNS.OTHER_PHONE),
            otherName: getValue(types_1.ST_SHEET_COLUMNS.OTHER_NAME),
            medication: getValue(types_1.ST_SHEET_COLUMNS.MEDICATION),
            notes: getValue(types_1.ST_SHEET_COLUMNS.NOTES),
            // 개인정보
            ssn: getValue(types_1.ST_SHEET_COLUMNS.SSN),
            region: getValue(types_1.ST_SHEET_COLUMNS.REGION),
            address: getValue(types_1.ST_SHEET_COLUMNS.ADDRESS),
            addressDetail: getValue(types_1.ST_SHEET_COLUMNS.ADDRESS_DETAIL),
            email: getValue(types_1.ST_SHEET_COLUMNS.EMAIL),
            // ⭐️ 멘토 및 반 배정
            classNumber: getValue(types_1.ST_SHEET_COLUMNS.CLASS_NUMBER),
            className: getValue(types_1.ST_SHEET_COLUMNS.CLASS_NAME),
            classMentor: getValue(types_1.ST_SHEET_COLUMNS.CLASS_MENTOR),
            unitMentor: getValue(types_1.ST_SHEET_COLUMNS.UNIT_MENTOR),
            roomNumber: getValue(types_1.ST_SHEET_COLUMNS.ROOM_NUMBER),
            // 메타
            rowNumber,
            lastSyncedAt: new Date(),
            displayFields: {}
        };
    }
}
exports.STSheetService = STSheetService;
