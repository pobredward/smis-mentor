'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { SMSTemplate, saveSMSTemplate, getAllSMSTemplates, deleteSMSTemplate, updateSMSTemplate } from '@/lib/smsTemplateService';
import Button from '@/components/common/Button';

const templateSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요.'),
  content: z.string().min(1, '내용을 입력해주세요.'),
  type: z.enum(['document', 'interview', 'final', 'etc']),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

interface SMSTemplateManagerProps {
  adminId: string;
}

export default function SMSTemplateManager({ adminId }: SMSTemplateManagerProps) {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SMSTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      title: '',
      content: '',
      type: 'document',
    }
  });
  
  // 템플릿 불러오기
  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const allTemplates = await getAllSMSTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('템플릿 로드 오류:', error);
      toast.error('템플릿을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadTemplates();
  }, []);
  
  // 템플릿 생성/수정 폼 제출
  const onSubmit = async (data: TemplateFormValues) => {
    try {
      setIsLoading(true);
      
      const templateData = {
        ...data,
        createdBy: adminId,
      };
      
      if (selectedTemplate) {
        // 수정
        await updateSMSTemplate(selectedTemplate.id!, templateData);
        toast.success('템플릿이 수정되었습니다.');
      } else {
        // 생성
        await saveSMSTemplate(templateData);
        toast.success('새 템플릿이 생성되었습니다.');
      }
      
      // 템플릿 다시 불러오기
      await loadTemplates();
      
      // 폼 초기화 및 모달 닫기
      reset();
      setSelectedTemplate(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('템플릿 저장 오류:', error);
      toast.error('템플릿 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 템플릿 수정 버튼
  const handleEditTemplate = (template: SMSTemplate) => {
    setSelectedTemplate(template);
    reset({
      title: template.title,
      content: template.content,
      type: template.type,
    });
    setIsModalOpen(true);
  };
  
  // 템플릿 삭제 버튼
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('정말로 이 템플릿을 삭제하시겠습니까?')) return;
    
    try {
      setIsLoading(true);
      await deleteSMSTemplate(id);
      toast.success('템플릿이 삭제되었습니다.');
      await loadTemplates();
    } catch (error) {
      console.error('템플릿 삭제 오류:', error);
      toast.error('템플릿 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 타입 한글 표시
  const getTemplateTypeText = (type: string) => {
    switch (type) {
      case 'document': return '서류 전형';
      case 'interview': return '면접 전형';
      case 'final': return '최종 결과';
      case 'etc': return '기타';
      default: return type;
    }
  };
  
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">SMS 템플릿 관리</h2>
        <Button 
          onClick={() => {
            reset();
            setSelectedTemplate(null);
            setIsModalOpen(true);
          }}
          variant="primary"
          size="sm"
        >
          새 템플릿 추가
        </Button>
      </div>
      
      {/* 템플릿 목록 */}
      <div className="bg-white shadow-md rounded-md overflow-hidden">
        {templates.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            등록된 템플릿이 없습니다. 새 템플릿을 추가해주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제목
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    유형
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    내용
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {template.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getTemplateTypeText(template.type)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {template.content}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      <Button
                        onClick={() => handleEditTemplate(template)}
                        variant="secondary"
                        size="sm"
                        className="mr-2"
                      >
                        수정
                      </Button>
                      <Button
                        onClick={() => handleDeleteTemplate(template.id!)}
                        variant="danger"
                        size="sm"
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* 템플릿 추가/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-black/0 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {selectedTemplate ? '템플릿 수정' : '새 템플릿 추가'}
            </h3>
            
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  제목
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="템플릿 제목"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                )}
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  유형
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  {...register('type')}
                >
                  <option value="document">서류 전형</option>
                  <option value="interview">면접 전형</option>
                  <option value="final">최종 결과</option>
                  <option value="etc">기타</option>
                </select>
                {errors.type && (
                  <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
                )}
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내용
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  rows={5}
                  placeholder="문자 내용을 입력하세요. {이름}, {휴대폰번호}와 같이 변수를 사용할 수 있습니다."
                  {...register('content')}
                />
                {errors.content && (
                  <p className="mt-1 text-sm text-red-600">{errors.content.message}</p>
                )}
              </div>
              
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-1/2"
                  onClick={() => setIsModalOpen(false)}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-1/2"
                  isLoading={isLoading}
                >
                  {selectedTemplate ? '수정' : '추가'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 