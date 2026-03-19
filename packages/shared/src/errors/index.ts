/**
 * 애플리케이션 전역 에러 클래스
 */

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
    Object.setPrototypeOf(this, ServiceError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class NotFoundError extends ServiceError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource}를 찾을 수 없습니다: ${id}`
      : `${resource}를 찾을 수 없습니다`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message: string = '인증이 필요합니다') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends ServiceError {
  constructor(message: string = '권한이 없습니다') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class DatabaseError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * 에러 핸들러 유틸리티
 */
export function handleServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }

  if (error instanceof Error) {
    return new ServiceError(error.message, 'UNKNOWN_ERROR', 500);
  }

  return new ServiceError('알 수 없는 오류가 발생했습니다', 'UNKNOWN_ERROR', 500);
}

/**
 * 에러 응답 생성
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    statusCode: number;
    details?: unknown;
  };
}

export function createErrorResponse(error: unknown): ErrorResponse {
  const serviceError = handleServiceError(error);
  
  return {
    success: false,
    error: {
      message: serviceError.message,
      code: serviceError.code,
      statusCode: serviceError.statusCode,
      details: serviceError.details,
    },
  };
}
