// SMS 템플릿 타입 및 서비스
export type TemplateType = 
  | 'document_pass' 
  | 'document_fail' 
  | 'interview_scheduled'
  | 'interview_pass' 
  | 'interview_fail' 
  | 'final_pass' 
  | 'final_fail';

export interface SMSTemplate {
  id?: string;
  title: string;
  content: string;
  type: TemplateType;
  refJobBoardId?: string;
  createdAt: any;
  updatedAt: any;
  createdBy?: string;
}
