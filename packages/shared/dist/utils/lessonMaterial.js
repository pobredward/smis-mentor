"use strict";
/**
 * 수업 자료 관련 유틸리티 함수
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterSectionsWithLinks = filterSectionsWithLinks;
exports.getGenerationCodes = getGenerationCodes;
exports.filterMaterialsByGeneration = filterMaterialsByGeneration;
exports.getMaterialGenerationCode = getMaterialGenerationCode;
/**
 * 수업 자료에서 실제 링크가 있는 섹션만 필터링
 * @param sections 섹션 배열
 * @returns 링크가 있는 섹션만 포함된 배열
 */
function filterSectionsWithLinks(sections) {
    return sections.filter(section => section.viewUrl || section.originalUrl);
}
/**
 * 수업 자료를 기수별로 그룹화하고 내림차순 정렬
 * @param materials 수업 자료 배열
 * @param templates 템플릿 배열
 * @returns 기수 배열 (내림차순)
 */
function getGenerationCodes(materials, templates) {
    const materialCodeMap = {};
    materials.forEach(m => {
        if (m.templateId) {
            const tpl = templates.find(t => t.id === m.templateId);
            materialCodeMap[m.id] = tpl?.code || '미지정';
        }
        else {
            materialCodeMap[m.id] = m.userCode || '미지정';
        }
    });
    const allCodes = Array.from(new Set(Object.values(materialCodeMap)));
    // 기수별 내림차순 정렬 (숫자 추출하여 비교, 미지정은 맨 뒤)
    return allCodes.sort((a, b) => {
        if (a === '미지정')
            return 1;
        if (b === '미지정')
            return -1;
        // 숫자 추출 (예: "27기" -> 27)
        const numA = parseInt(a.replace(/[^0-9]/g, ''));
        const numB = parseInt(b.replace(/[^0-9]/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) {
            return numB - numA; // 내림차순
        }
        return a.localeCompare(b);
    });
}
/**
 * 특정 기수의 수업 자료만 필터링
 * @param materials 수업 자료 배열
 * @param templates 템플릿 배열
 * @param generation 기수 코드 (예: "27기")
 * @returns 필터링된 수업 자료 배열
 */
function filterMaterialsByGeneration(materials, templates, generation) {
    return materials.filter(m => {
        if (m.templateId) {
            const tpl = templates.find(t => t.id === m.templateId);
            return tpl?.code === generation;
        }
        else {
            return m.userCode === generation;
        }
    });
}
/**
 * 수업 자료의 기수 코드 가져오기
 * @param material 수업 자료
 * @param templates 템플릿 배열
 * @returns 기수 코드
 */
function getMaterialGenerationCode(material, templates) {
    if (material.templateId) {
        const tpl = templates.find(t => t.id === material.templateId);
        return tpl?.code || '미지정';
    }
    return material.userCode || '미지정';
}
