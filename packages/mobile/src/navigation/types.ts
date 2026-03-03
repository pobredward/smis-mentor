import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialTopTabScreenProps } from '@react-navigation/material-top-tabs';

// Root Stack (전체 네비게이션)
export type RootStackParamList = {
  MainTabs: undefined;
  StudentDetail: { studentId: string };
};

// Bottom Tabs (메인 하단 탭)
export type MainTabsParamList = {
  Home: undefined;
  Recruitment: undefined;
  Camp: undefined;
  Settings: undefined;
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
  UserCheck: undefined;
  Upload: undefined;
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
