import { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Button from './Button';

interface ImageCropperProps {
  file: File;
  onCropComplete: (croppedFile: File) => void;
  onCancel: () => void;
  aspectRatio?: number; // 추가: 가로세로 비율(기본값: 1)
}

// 이미지가 로드될 때 초기 크롭 영역 계산
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  // 정사각형 크롭 영역을 제한된 크기로 설정
  const smallerValue = Math.min(mediaWidth, mediaHeight);
  const cropSize = smallerValue * 0.8; // 이미지의 80%로 초기 크롭 영역 설정
  
  return centerCrop(
    makeAspectCrop(
      {
        unit: 'px', // 픽셀 단위 사용
        width: cropSize,
        height: cropSize,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

// 캔버스에 크롭된 이미지를 그리는 함수 - 완전히 새로 작성
function canvasPreview(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  crop: PixelCrop,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No 2d context');
  }

  // 이미지의 실제 크기와 표시 크기 사이의 비율 계산
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // 캔버스 크기 설정 (정사각형으로 고정)
  canvas.width = 128; // 미리보기 크기 고정
  canvas.height = 128; // 미리보기 크기 고정

  // 컨텍스트 초기화
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 고품질 출력을 위한 설정
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // 이미지의 실제 좌표 계산 (비율 적용)
  const sourceX = crop.x * scaleX;
  const sourceY = crop.y * scaleY;
  const sourceWidth = crop.width * scaleX;
  const sourceHeight = crop.height * scaleY;
  
  // 크롭된 영역을 캔버스에 그림
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
}

// File 객체로 변환
async function getCroppedImg(
  image: HTMLImageElement,
  crop: PixelCrop,
  fileName: string,
): Promise<File> {
  if (!crop || !crop.width || !crop.height) {
    throw new Error('Crop not defined');
  }
  
  // 추가 검증
  if (crop.width <= 0 || crop.height <= 0) {
    throw new Error('Invalid crop dimensions');
  }
  
  // 이미지의 실제 크기와 표시 크기 사이의 비율 계산
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  
  // 실제 크롭 영역 계산
  const pixelCrop = {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
    unit: 'px'
  };
  
  // 캔버스 생성 및 설정
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No 2d context');
  }
  
  // 크롭된 이미지 그리기
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );
  
  // 디버그 정보 출력
  console.log('Original image:', {
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    displayWidth: image.width,
    displayHeight: image.height
  });
  console.log('Scale factors:', { scaleX, scaleY });
  console.log('Display crop:', crop);
  console.log('Pixel crop:', pixelCrop);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        resolve(file);
      },
      'image/jpeg',
      1.0 // 최대 품질
    );
  });
}

const ImageCropper: React.FC<ImageCropperProps> = ({ 
  file, 
  onCropComplete, 
  onCancel,
  aspectRatio = 1 // 기본값 1 (정사각형)
}) => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imgSrc, setImgSrc] = useState<string>('');
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // 파일에서 이미지 URL 생성
  useEffect(() => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setImgSrc(reader.result as string);
    });
    reader.readAsDataURL(file);
    
    // 컴포넌트 언마운트 시 URL 정리
    return () => {
      if (imgSrc) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [file]);
  
  // completedCrop이 변경될 때마다 미리보기 업데이트
  useEffect(() => {
    if (
      completedCrop?.width &&
      completedCrop?.height &&
      imgRef.current &&
      previewCanvasRef.current
    ) {
      try {
        // 미리보기 업데이트
        canvasPreview(
          imgRef.current,
          previewCanvasRef.current,
          completedCrop
        );
      } catch (error) {
        console.error('미리보기 업데이트 오류:', error);
      }
    }
  }, [completedCrop]);
  
  // 이미지 로드 시 초기 크롭 영역 설정
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    
    // 이미지 정보 출력
    console.log('Image loaded:', { width, height });
    
    // aspectRatio 프로퍼티 사용
    const newCrop = centerAspectCrop(width, height, aspectRatio);
    setCrop(newCrop);
    setCompletedCrop({
      unit: 'px',
      x: newCrop.x,
      y: newCrop.y,
      width: newCrop.width,
      height: newCrop.width / aspectRatio, // aspectRatio 적용
    } as PixelCrop);
  }
  
  // 크롭 적용 버튼 핸들러
  const handleCropApply = async () => {
    try {
      if (!imgRef.current || !completedCrop) {
        throw new Error('Image or crop not ready');
      }
      
      // 최종 크롭 확인 로깅
      console.log('Final crop being applied:', completedCrop);
      
      const croppedFile = await getCroppedImg(
        imgRef.current,
        completedCrop,
        file.name
      );
      
      onCropComplete(croppedFile);
    } catch (error) {
      console.error('이미지 크롭 오류:', error);
      alert('이미지 크롭 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-3">이미지 자르기</h3>
      
      {imgSrc && (
        <div className="mb-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1">
              <ReactCrop
                crop={crop}
                onChange={(percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspectRatio} // aspectRatio 프로퍼티 사용
                circularCrop={false}
                keepSelection={true}
                className="max-h-[400px] mx-auto"
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="이미지 자르기"
                  onLoad={onImageLoad}
                  className="max-h-[400px] mx-auto"
                  crossOrigin="anonymous"
                />
              </ReactCrop>
              <p className="text-sm text-gray-500 mt-2 text-center">
                이미지를 드래그하여 원하는 영역을 선택하세요.
              </p>
            </div>
            
            {completedCrop && (
              <div className="flex-1 flex flex-col items-center">
                <p className="text-sm font-medium mb-2">미리보기</p>
                <canvas
                  ref={previewCanvasRef}
                  className="w-32 h-32 border rounded-md object-contain"
                  style={{
                    objectFit: 'contain',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db'
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="flex justify-end space-x-2">
        <Button
          variant="outline"
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          variant="primary"
          onClick={handleCropApply}
          disabled={!completedCrop?.width || !completedCrop?.height}
        >
          적용
        </Button>
      </div>
    </div>
  );
};

export default ImageCropper; 