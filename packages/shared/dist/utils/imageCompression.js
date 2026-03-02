"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressImage = compressImage;
exports.bytesToMB = bytesToMB;
exports.validateImageType = validateImageType;
exports.validateImageSize = validateImageSize;
/**
 * 이미지 압축 유틸리티
 */
async function compressImage(file, quality = 0.8, maxWidth = 1200, maxHeight = 1200) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target?.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                // 최대 크기 계산
                if (width > height) {
                    if (width > maxWidth) {
                        height = height * (maxWidth / width);
                        width = maxWidth;
                    }
                }
                else {
                    if (height > maxHeight) {
                        width = width * (maxHeight / height);
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context를 가져올 수 없습니다.'));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('이미지 압축에 실패했습니다.'));
                        return;
                    }
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = () => {
                reject(new Error('이미지 로드에 실패했습니다.'));
            };
        };
        reader.onerror = () => {
            reject(new Error('파일 읽기에 실패했습니다.'));
        };
        reader.readAsDataURL(file);
    });
}
/**
 * 파일 크기를 MB로 변환
 */
function bytesToMB(bytes) {
    return bytes / (1024 * 1024);
}
/**
 * 파일 타입 검증
 */
function validateImageType(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    return validTypes.includes(file.type);
}
/**
 * 파일 크기 검증 (MB 단위)
 */
function validateImageSize(file, maxSizeMB = 10) {
    return bytesToMB(file.size) <= maxSizeMB;
}
