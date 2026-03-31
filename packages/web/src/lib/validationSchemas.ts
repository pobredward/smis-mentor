import { z } from 'zod';
import type { TemplateType } from '@smis-mentor/shared';

export const sendSMSSchema = z.object({
  phoneNumber: z.string().min(1, '전화번호는 필수입니다.'),
  templateId: z.string().optional(),
  variables: z.record(z.string()).optional(),
  content: z.string().optional(),
  userName: z.string().optional(),
  fromNumber: z.string().optional(),
}).refine(
  (data) => data.templateId || data.content,
  {
    message: '템플릿 ID 또는 직접 내용이 필요합니다.',
    path: ['content'],
  }
);

export const createSMSTemplateSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다.'),
  content: z.string().min(1, '내용은 필수입니다.'),
  type: z.string() as z.ZodType<TemplateType>,
});

export const updateSMSTemplateSchema = z.object({
  id: z.string().min(1, '템플릿 ID는 필수입니다.'),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional(),
}).refine(
  (data) => data.title || data.content || data.type,
  {
    message: '업데이트할 필드가 최소 하나는 필요합니다.',
  }
);

export const shareApplicantsSchema = z.object({
  jobBoardId: z.string().min(1, '캠프 공고 ID는 필수입니다.'),
  applicationIds: z.array(z.string().min(1)).min(1, '최소 한 명의 지원자를 선택해야 합니다.'),
  expirationHours: z.number().min(1, '만료 시간은 최소 1시간 이상이어야 합니다.').max(168, '만료 시간은 최대 7일(168시간)까지 가능합니다.'),
});
