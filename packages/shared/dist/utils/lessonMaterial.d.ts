/**
 * 수업 자료 관련 유틸리티 함수
 */
export interface LessonMaterialData {
    id: string;
    title: string;
    templateId?: string;
    userCode?: string;
    order?: number;
}
export interface LessonMaterialTemplate {
    id: string;
    code: string;
    title: string;
    order?: number;
}
export interface SectionData {
    id: string;
    title: string;
    viewUrl?: string;
    originalUrl?: string;
    order?: number;
}
/**
 * 수업 자료에서 실제 링크가 있는 섹션만 필터링
 * @param sections 섹션 배열
 * @returns 링크가 있는 섹션만 포함된 배열
 */
export declare function filterSectionsWithLinks(sections: SectionData[]): SectionData[];
/**
 * 수업 자료를 기수별로 그룹화하고 내림차순 정렬
 * @param materials 수업 자료 배열
 * @param templates 템플릿 배열
 * @returns 기수 배열 (내림차순)
 */
export declare function getGenerationCodes(materials: LessonMaterialData[], templates: LessonMaterialTemplate[]): string[];
/**
 * 특정 기수의 수업 자료만 필터링
 * @param materials 수업 자료 배열
 * @param templates 템플릿 배열
 * @param generation 기수 코드 (예: "27기")
 * @returns 필터링된 수업 자료 배열
 */
export declare function filterMaterialsByGeneration(materials: LessonMaterialData[], templates: LessonMaterialTemplate[], generation: string): LessonMaterialData[];
/**
 * 수업 자료의 기수 코드 가져오기
 * @param material 수업 자료
 * @param templates 템플릿 배열
 * @returns 기수 코드
 */
export declare function getMaterialGenerationCode(material: LessonMaterialData, templates: LessonMaterialTemplate[]): string;
//# sourceMappingURL=lessonMaterial.d.ts.map