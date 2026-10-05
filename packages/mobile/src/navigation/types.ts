import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialTopTabScreenProps } from '@react-navigation/material-top-tabs';
import type { CampPageCategory, CampTeacherKind } from '@smis-mentor/shared';

// Root Stack (전체 네비게이션)
export type RootStackParamList = {
  /** 하단 탭 — 알림에서 특정 탭으로 바로 갈 때 { screen: 'Chat' } 처럼 넘긴다 */
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  ProfileEdit: undefined;
  StudentDetail: { studentId: string };
  TaskDetail: { taskId: string; taskDate?: string };
  PersonalTaskDetail: { taskId: string; taskDate?: string };
  CampDetail: { category: CampPageCategory; itemId: string; itemTitle: string };
  CampEditor: {
    category: CampPageCategory;
    itemId: string;
    itemTitle: string;
    initialContent: string;
  };
  Settings: undefined;
  LocationSettings: undefined;
  NotificationTest: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  /** 채팅 대화방 */
  ChatRoom: { roomId: string };
  /** 원어민 레슨플랜 — bookKey(내 교재) · planId(문서) · sample(샘플: speaking·reading·writing) */
  LessonPlan: { bookKey?: string; planId?: string; sample?: string };
  /** 학부모 — 아이 등록(childId 없음) · 정보 고치기 */
  ParentChildForm: { childId?: string };
  /** 학부모 — 캠프 신청(campCode 없음) · 신청서 고치기 */
  ParentApplication: { childId: string; campCode?: string; studentId?: string };
};

// Bottom Tabs (메인 하단 탭)
export type MainTabsParamList = {
  Home: undefined;
  ParentHome: undefined;
  Recruitment: undefined;
  Camp: undefined;
  /** 채팅 (카톡방 대체) */
  Chat: undefined;
  Profile: undefined;
  Admin: undefined;
};

// Recruitment Stack (채용 스택)
export type RecruitmentStackParamList = {
  RecruitmentList: { openApplicationTab?: boolean } | undefined;
  JobBoardDetail: { jobBoardId: string };
  JobBoardEdit: { jobBoardId: string };
  JobBoardWrite: undefined;
};

// Admin Stack (관리자 스택)
export type AdminStackParamList = {
  AdminDashboard: undefined;
  UserGenerate: undefined;
  JobGenerate: undefined;
  JobBoardWrite: undefined;
  JobBoardManage: undefined;
  JobBoardApplicants: { jobBoardId: string };
  ApplicantDetail: { applicationId: string; jobBoardId: string };
  InterviewManage: undefined;
  UserManage: undefined;
  UserManageDetail: { user: any };
  /** 한국인 멘토 선생님 / 원어민 선생님 (웹 /admin/user-check · /admin/foreign-teachers) */
  UserCheck: { kind?: CampTeacherKind } | undefined;
  UserMap: undefined;
  Upload: undefined;
  AppConfig: undefined;
  StudentSearch: undefined;
  StFieldConfig: undefined;
};

// Camp Top Tabs (캠프 상단 세부 탭)
export type CampTabsParamList = {
  Education: undefined;
  Tasks: undefined;
  Class: undefined;
  Room: undefined;
  Patient: undefined;
};

// Class Tabs (반/유닛 탭)
export type ClassTabsParamList = {
  ClassStudents: undefined;
  UnitStudents: undefined;
};

// Navigation Props 타입
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabsParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabsParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

export type CampTabScreenProps<T extends keyof CampTabsParamList> =
  CompositeScreenProps<
    MaterialTopTabScreenProps<CampTabsParamList, T>,
    MainTabScreenProps<'Camp'>
  >;

export type ClassTabScreenProps<T extends keyof ClassTabsParamList> =
  MaterialTopTabScreenProps<ClassTabsParamList, T>;

export type RecruitmentStackScreenProps<
  T extends keyof RecruitmentStackParamList
> = CompositeScreenProps<
  NativeStackScreenProps<RecruitmentStackParamList, T>,
  MainTabScreenProps<'Recruitment'>
>;

export type AdminStackScreenProps<T extends keyof AdminStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<AdminStackParamList, T>,
    MainTabScreenProps<'Admin'>
  >;
