"use strict";
// ST시트 관련 타입 정의
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLASS_NAMES = exports.MENTORS = exports.ST_SHEET_COLUMNS = void 0;
exports.ST_SHEET_COLUMNS = {
    // 기본 정보 (A-E)
    STUDENT_ID: 'A',
    NAME: 'B',
    ENGLISH_NAME: 'C',
    GRADE: 'D',
    GENDER: 'E',
    // 연락처 정보 (F-K)
    PARENT_PHONE: 'F',
    PARENT_NAME: 'G',
    OTHER_PHONE: 'H',
    OTHER_NAME: 'I',
    MEDICATION: 'J',
    NOTES: 'K',
    // 개인정보 (L-R)
    SSN: 'L',
    REGION: 'M',
    ADDRESS: 'N',
    ADDRESS_DETAIL: 'O',
    EMAIL: 'P',
    DEPARTURE_ROUTE: 'Q',
    ARRIVAL_ROUTE: 'R',
    // 기타 (S-V)
    ETC: 'S',
    CASH_RECEIPT: 'T',
    REGISTRATION_SOURCE: 'U',
    MEMO: 'V',
    ROOM_NOTES: 'W',
    // ⭐️ 핵심: 멘토 및 반 배정 (실제 스프레드시트 기준)
    CLASS_NUMBER: 'BA', // 반 번호 (예: E03.10) - BA열
    CLASS_NAME: 'BB', // 반 이름 (예: Sailor) - BB열
    CLASS_MENTOR: 'BC', // 반멘토 (사용자 확인: BC열)
    UNIT_MENTOR: 'BD', // 유닛멘토 (사용자 확인: BD열)
    ROOM_NUMBER: 'BE', // 방 번호 - BE열
};
exports.MENTORS = [
    '윤수빈',
    '박현정',
    '강준서',
    '박성빈',
    '백현길',
    '이겸수',
    '윤연우',
    '김가람',
    '강경제',
    '김용재',
    '박준우',
    '허난'
];
exports.CLASS_NAMES = [
    'Grit',
    'Sailor',
    'Halo',
    'Fable',
    'Dolphin',
    'Vivid',
    'Act',
    'Chef',
    'Puzzle'
];
