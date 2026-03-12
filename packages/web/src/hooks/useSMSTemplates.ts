import { useState, useCallback, useEffect } from 'react';
import { 
  getSMSTemplateByTypeAndJobBoard, 
  TemplateType,
  SMSTemplate,
  saveSMSTemplate,
  updateSMSTemplate,
} from '@/lib/smsTemplateService';
import { auth } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface TemplateMessages {
  documentPass: string;
  documentFail: string;
  interviewScheduled: string;
  interviewPass: string;
  interviewFail: string;
  finalPass: string;
  finalFail: string;
}

interface UseTemplatesOptions {
  jobBoardId?: string;
  jobBoardTitle?: string;
  onLoadSuccess?: () => void;
  onLoadError?: (error: Error) => void;
}

const TEMPLATE_CONFIG: Array<{
  type: TemplateType;
  key: keyof TemplateMessages;
  label: string;
  getDefaultMessage: (title: string) => string;
}> = [
  {
    type: 'document_pass',
    key: 'documentPass',
    label: '서류 합격',
    getDefaultMessage: (title) =>
      `안녕하세요, {이름}님.\n${title} 채용에 지원해주셔서 감사합니다.\n서류 전형 합격을 축하드립니다. 다음 면접 일정을 안내드리겠습니다.`,
  },
  {
    type: 'document_fail',
    key: 'documentFail',
    label: '서류 불합격',
    getDefaultMessage: (title) =>
      `안녕하세요, {이름}님.\n${title} 채용에 지원해주셔서 감사합니다.\n아쉽게도 이번 서류 전형에 합격하지 못하셨습니다. 다음 기회에 다시 만나뵙기를 희망합니다.`,
  },
  {
    type: 'interview_scheduled',
    key: 'interviewScheduled',
    label: '면접 예정',
    getDefaultMessage: (title) =>
      `안녕하세요, {이름}님.\n${title} 서류 전형 합격을 축하드립니다.\n\n면접 일정을 안내드립니다.\n• 면접 일시: {면접일자} {면접시간}\n• 면접 링크: {면접링크}\n• 면접 시간: {면접시간} (약 {면접소요시간}분)\n\n준비사항: {면접참고사항}\n\n면접에 참석해주시기 바랍니다.`,
  },
  {
    type: 'interview_pass',
    key: 'interviewPass',
    label: '면접 합격',
    getDefaultMessage: (title) =>
      `안녕하세요, {이름}님.\n${title} 면접에 참여해주셔서 감사합니다.\n면접 전형 합격을 축하드립니다. 후속 단계에 대해 안내드리겠습니다.`,
  },
  {
    type: 'interview_fail',
    key: 'interviewFail',
    label: '면접 불합격',
    getDefaultMessage: (title) =>
      `안녕하세요, {이름}님.\n${title} 면접에 참여해주셔서 감사합니다.\n아쉽게도 이번 면접 전형에 합격하지 못하셨습니다. 다음 기회에 다시 만나뵙기를 희망합니다.`,
  },
  {
    type: 'final_pass',
    key: 'finalPass',
    label: '최종 합격',
    getDefaultMessage: (title) =>
      `축하합니다, {이름}님!\n${title}에 최종 합격하셨습니다. 입사 관련 안내사항은 추후 이메일로 전달드릴 예정입니다.`,
  },
  {
    type: 'final_fail',
    key: 'finalFail',
    label: '최종 불합격',
    getDefaultMessage: (title) =>
      `안녕하세요, {이름}님.\n${title} 채용에 지원해주셔서 감사합니다.\n아쉽게도 이번 최종 전형에 합격하지 못하셨습니다. 다음 기회에 다시 만나뵙기를 희망합니다.`,
  },
];

export const useSMSTemplates = ({
  jobBoardId,
  jobBoardTitle = '',
  onLoadSuccess,
  onLoadError,
}: UseTemplatesOptions = {}) => {
  const [messages, setMessages] = useState<TemplateMessages>({
    documentPass: '',
    documentFail: '',
    interviewScheduled: '',
    interviewPass: '',
    interviewFail: '',
    finalPass: '',
    finalFail: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 모든 템플릿을 병렬로 로드
  const loadTemplates = useCallback(async () => {
    if (!jobBoardId) return;

    try {
      setIsLoading(true);

      // 병렬 처리로 성능 향상
      const templatePromises = TEMPLATE_CONFIG.map(({ type, getDefaultMessage }) =>
        getSMSTemplateByTypeAndJobBoard(type, jobBoardId)
          .then(template => template?.content || getDefaultMessage(jobBoardTitle))
          .catch(() => getDefaultMessage(jobBoardTitle))
      );

      const results = await Promise.all(templatePromises);

      const newMessages: TemplateMessages = {
        documentPass: results[0],
        documentFail: results[1],
        interviewScheduled: results[2],
        interviewPass: results[3],
        interviewFail: results[4],
        finalPass: results[5],
        finalFail: results[6],
      };

      setMessages(newMessages);
      onLoadSuccess?.();
    } catch (error) {
      console.error('템플릿 로드 실패:', error);
      const err = error instanceof Error ? error : new Error('템플릿 로드 실패');
      onLoadError?.(err);
      
      // 실패 시 기본 메시지로 폴백
      const defaultMessages: TemplateMessages = {
        documentPass: TEMPLATE_CONFIG[0].getDefaultMessage(jobBoardTitle),
        documentFail: TEMPLATE_CONFIG[1].getDefaultMessage(jobBoardTitle),
        interviewScheduled: TEMPLATE_CONFIG[2].getDefaultMessage(jobBoardTitle),
        interviewPass: TEMPLATE_CONFIG[3].getDefaultMessage(jobBoardTitle),
        interviewFail: TEMPLATE_CONFIG[4].getDefaultMessage(jobBoardTitle),
        finalPass: TEMPLATE_CONFIG[5].getDefaultMessage(jobBoardTitle),
        finalFail: TEMPLATE_CONFIG[6].getDefaultMessage(jobBoardTitle),
      };
      setMessages(defaultMessages);
    } finally {
      setIsLoading(false);
    }
  }, [jobBoardId, jobBoardTitle, onLoadSuccess, onLoadError]);

  // 특정 메시지 업데이트
  const updateMessage = useCallback((key: keyof TemplateMessages, value: string) => {
    setMessages(prev => ({ ...prev, [key]: value }));
  }, []);

  // 템플릿 저장
  const saveTemplate = useCallback(async (type: TemplateType, content: string) => {
    if (!jobBoardId) {
      toast.error('공고 정보가 없습니다.');
      return false;
    }

    try {
      setIsSaving(true);

      const currentUser = auth.currentUser;
      const createdBy = currentUser?.uid || 'system';

      // 기존 템플릿 확인
      const existingTemplate = await getSMSTemplateByTypeAndJobBoard(type, jobBoardId);

      if (existingTemplate?.id) {
        // 업데이트
        await updateSMSTemplate(existingTemplate.id, {
          content,
          type,
          refJobBoardId: jobBoardId,
          title: `${TEMPLATE_CONFIG.find(t => t.type === type)?.label} 템플릿`,
          createdBy,
        });
      } else {
        // 신규 저장
        await saveSMSTemplate({
          title: `${TEMPLATE_CONFIG.find(t => t.type === type)?.label} 템플릿`,
          content,
          type,
          refJobBoardId: jobBoardId,
          createdBy,
        });
      }

      // 로컬 상태 즉시 업데이트
      const config = TEMPLATE_CONFIG.find(t => t.type === type);
      if (config) {
        updateMessage(config.key, content);
      }

      toast.success('템플릿이 저장되었습니다.');
      return true;
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
      toast.error('템플릿 저장에 실패했습니다.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [jobBoardId, updateMessage]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return {
    messages,
    updateMessage,
    saveTemplate,
    loadTemplates,
    isLoading,
    isSaving,
    templateConfig: TEMPLATE_CONFIG,
  };
};
