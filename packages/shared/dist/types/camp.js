// 캠프 관련 타입 정의
// 그룹 선택지 (주니어, 미들, 시니어, 계절)
export const JOB_EXPERIENCE_GROUPS = [
    '주니어',
    '미들',
    '시니어',
    '스프링',
    '서머',
    '어텀',
    '윈터',
    '공통',
];
// 그룹 역할 선택지 - 멘토용
export const MENTOR_GROUP_ROLES = [
    '담임',
    '수업',
    '매니저',
    '부매니저',
];
// 그룹 역할 선택지 - 원어민용
export const FOREIGN_GROUP_ROLES = [
    'Speaking',
    'Reading',
    'Writing',
    'Mix',
    'Manager',
    'Sub Manager',
];
// 전체 그룹 역할 (호환성 유지)
export const JOB_EXPERIENCE_GROUP_ROLES = [
    ...MENTOR_GROUP_ROLES,
    ...FOREIGN_GROUP_ROLES,
];
// 레거시 그룹 매핑 (junior/middle/senior <-> 주니어/미들/시니어)
export const LEGACY_GROUP_MAP = {
    'junior': '주니어',
    'middle': '미들',
    'senior': '시니어',
    'spring': '스프링',
    'summer': '서머',
    'autumn': '어텀',
    'winter': '윈터',
    'common': '공통',
};
export const LEGACY_GROUP_REVERSE_MAP = {
    '주니어': 'junior',
    '미들': 'middle',
    '시니어': 'senior',
    '스프링': 'spring',
    '서머': 'summer',
    '어텀': 'autumn',
    '윈터': 'winter',
    '공통': 'common',
};
// 그룹 표시 이름 가져오기
export const getGroupLabel = (group) => {
    return LEGACY_GROUP_MAP[group] || group;
};
// 그룹 값 가져오기
export const getGroupValue = (label) => {
    return LEGACY_GROUP_REVERSE_MAP[label] || label;
};
