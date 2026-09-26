// 타입 정의 통합 export
export * from './student';
export * from './fieldConfig';
export * from './camp';
export * from './campPage';
export * from './campTimetable';
export * from './eslBook';
export * from './timetableGuide';
export * from './lodging';
export * from './permission';
export * from './evaluation';
export * from './sms';
export * from './auth';
export * from './appConfig';
export * from './inventory';
export * from './notification';

// 기존 타입들도 re-export (추후 이동 예정)
export type {
  User, JobBoard, ApplicationHistory, Review, PartTimeJob, JobGroup, JobCode, JobCodeWithId, JobCodeWithGroup,
  JobExperience, JobBoardWithId, ApplicationHistoryWithId,
} from './legacy';

export * from './community';
export * from './lessonMaterial';
