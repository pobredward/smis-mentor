import { TemplateType } from '../types/sms';

// 기본 템플릿 메시지 (템플릿이 없을 경우 사용)
export const DEFAULT_SMS_TEMPLATES: Record<TemplateType, string> = {
  document_pass: '안녕하세요, {이름}님.\n서류 전형 합격을 축하드립니다.\n다음 면접 일정을 안내드리겠습니다.',
  document_fail: '안녕하세요, {이름}님.\n지원해주셔서 감사합니다.\n아쉽게도 이번 서류 전형에 합격하지 못하셨습니다.',
  interview_scheduled: '안녕하세요, {이름}님.\n서류 전형 합격을 축하드립니다.\n\n면접 일정을 안내드립니다.\n• 면접 일시: {면접일자} {면접시간}\n• 면접 링크: {면접링크}\n• 소요 시간: 약 {면접소요시간}분\n\n참고사항: {면접참고사항}\n\n면접에 참석해주시기 바랍니다.',
  interview_pass: '안녕하세요, {이름}님.\n면접에 참여해주셔서 감사합니다.\n면접 전형 합격을 축하드립니다.',
  interview_fail: '안녕하세요, {이름}님.\n면접에 참여해주셔서 감사합니다.\n아쉽게도 이번 면접 전형에 합격하지 못하셨습니다.',
  final_pass: '축하합니다, {이름}님!\n최종 합격하셨습니다.\n입사 관련 안내사항은 추후 이메일로 전달드릴 예정입니다.',
  final_fail: '안녕하세요, {이름}님.\n지원해주셔서 감사합니다.\n아쉽게도 이번 최종 전형에 합격하지 못하셨습니다.',
};

export const TEMPLATE_CONFIG: Array<{
  type: TemplateType;
  label: string;
  category: '서류' | '면접' | '최종';
}> = [
  { type: 'document_pass', label: '서류 합격', category: '서류' },
  { type: 'document_fail', label: '서류 불합격', category: '서류' },
  { type: 'interview_scheduled', label: '면접 예정', category: '면접' },
  { type: 'interview_pass', label: '면접 합격', category: '면접' },
  { type: 'interview_fail', label: '면접 불합격', category: '면접' },
  { type: 'final_pass', label: '최종 합격', category: '최종' },
  { type: 'final_fail', label: '최종 불합격', category: '최종' },
];
