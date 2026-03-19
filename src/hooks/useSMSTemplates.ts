/**
 * SMS 템플릿 관리 커스텀 훅
 */

import { useState, useEffect } from 'react';
import { getSMSTemplateByTypeAndJobBoard, saveSMSTemplate, updateSMSTemplate, SMSTemplate, TemplateType } from '@/lib/smsTemplateService';
import { PhoneNumber } from '@/lib/naverCloudSMS';
import toast from 'react-hot-toast';

export function useSMSTemplates(jobBoardId?: string) {
  const [showDocumentPassMessage, setShowDocumentPassMessage] = useState(false);
  const [showDocumentFailMessage, setShowDocumentFailMessage] = useState(false);
  const [showInterviewScheduledMessage, setShowInterviewScheduledMessage] = useState(false);
  const [showInterviewPassMessage, setShowInterviewPassMessage] = useState(false);
  const [showInterviewFailMessage, setShowInterviewFailMessage] = useState(false);
  const [showFinalPassMessage, setShowFinalPassMessage] = useState(false);
  const [showFinalFailMessage, setShowFinalFailMessage] = useState(false);
  
  const [documentPassMessage, setDocumentPassMessage] = useState('');
  const [documentFailMessage, setDocumentFailMessage] = useState('');
  const [interviewScheduledMessage, setInterviewScheduledMessage] = useState('');
  const [interviewPassMessage, setInterviewPassMessage] = useState('');
  const [interviewFailMessage, setInterviewFailMessage] = useState('');
  const [finalPassMessage, setFinalPassMessage] = useState('');
  const [finalFailMessage, setFinalFailMessage] = useState('');
  
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [fromNumber, setFromNumber] = useState<PhoneNumber>('01076567933');

  useEffect(() => {
    if (jobBoardId) {
      loadSmsTemplates();
    }
  }, [jobBoardId]);

  const loadSmsTemplates = async () => {
    if (!jobBoardId) return;
    
    try {
      setIsLoadingMessage(true);
      
      const templates = await Promise.all([
        getSMSTemplateByTypeAndJobBoard('document_pass', jobBoardId),
        getSMSTemplateByTypeAndJobBoard('document_fail', jobBoardId),
        getSMSTemplateByTypeAndJobBoard('interview_scheduled', jobBoardId),
        getSMSTemplateByTypeAndJobBoard('interview_pass', jobBoardId),
        getSMSTemplateByTypeAndJobBoard('interview_fail', jobBoardId),
        getSMSTemplateByTypeAndJobBoard('final_pass', jobBoardId),
        getSMSTemplateByTypeAndJobBoard('final_fail', jobBoardId),
      ]);
      
      setDocumentPassMessage(templates[0]?.content || '');
      setDocumentFailMessage(templates[1]?.content || '');
      setInterviewScheduledMessage(templates[2]?.content || '');
      setInterviewPassMessage(templates[3]?.content || '');
      setInterviewFailMessage(templates[4]?.content || '');
      setFinalPassMessage(templates[5]?.content || '');
      setFinalFailMessage(templates[6]?.content || '');
    } catch (error) {
      console.error('SMS 템플릿 로드 실패:', error);
      toast.error('SMS 템플릿을 불러오는 데 실패했습니다.');
    } finally {
      setIsLoadingMessage(false);
    }
  };

  const saveTemplate = async (
    type: TemplateType,
    content: string,
    templateId?: string
  ) => {
    if (!jobBoardId) return;
    
    try {
      setIsSavingTemplate(true);
      
      if (templateId) {
        await updateSMSTemplate(templateId, { content });
      } else {
        await saveSMSTemplate({
          type,
          content,
          refJobBoardId: jobBoardId,
          createdBy: 'admin',
        });
      }
      
      toast.success('템플릿이 저장되었습니다.');
      await loadSmsTemplates();
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
      toast.error('템플릿 저장에 실패했습니다.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return {
    // States
    showDocumentPassMessage,
    showDocumentFailMessage,
    showInterviewScheduledMessage,
    showInterviewPassMessage,
    showInterviewFailMessage,
    showFinalPassMessage,
    showFinalFailMessage,
    documentPassMessage,
    documentFailMessage,
    interviewScheduledMessage,
    interviewPassMessage,
    interviewFailMessage,
    finalPassMessage,
    finalFailMessage,
    isLoadingMessage,
    isSavingTemplate,
    fromNumber,
    
    // Setters
    setShowDocumentPassMessage,
    setShowDocumentFailMessage,
    setShowInterviewScheduledMessage,
    setShowInterviewPassMessage,
    setShowInterviewFailMessage,
    setShowFinalPassMessage,
    setShowFinalFailMessage,
    setDocumentPassMessage,
    setDocumentFailMessage,
    setInterviewScheduledMessage,
    setInterviewPassMessage,
    setInterviewFailMessage,
    setFinalPassMessage,
    setFinalFailMessage,
    setFromNumber,
    
    // Actions
    loadSmsTemplates,
    saveTemplate,
  };
}
