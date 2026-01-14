// 通用错误接口
interface AppError {
  name: string;
  message: string;
  detail?: string;
  stack?: string;
  statusCode?: number;
}

export class HMTimeoutError extends Error implements AppError {
  name = "HMTimeoutError";
  message = "请求超时";
  detail?: string;

  constructor(detail?: string) {
    super();
    this.detail = detail;
  }
}

export class HMParseError extends Error implements AppError {
  name = "HMParseError";

  constructor(message?: string) {
    super(message);
  }
}

export class HMInvalidQueryError extends Error implements AppError {
  name = "HMInvalidQueryError";

  constructor(message?: string) {
    super(message);
  }
}

export class HMAPIError extends Error implements AppError {
  name = "HMAPIError";
  statusCode?: number;
  constructor(statusCode?: number, message?: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class HMNetWorkError extends Error implements AppError {
  name = "HMNetWorkError";
  errorCode?: number;
  constructor(errorCode?: number, message?: string) {
    super(message);
    this.errorCode = errorCode;
  }
}
