/**
 * 이미지 압축 유틸리티
 */
export declare function compressImage(file: File | Blob, quality?: number, maxWidth?: number, maxHeight?: number): Promise<Blob>;
/**
 * 파일 크기를 MB로 변환
 */
export declare function bytesToMB(bytes: number): number;
/**
 * 파일 타입 검증
 */
export declare function validateImageType(file: File | Blob): boolean;
/**
 * 파일 크기 검증 (MB 단위)
 */
export declare function validateImageSize(file: File | Blob, maxSizeMB?: number): boolean;
//# sourceMappingURL=imageCompression.d.ts.map