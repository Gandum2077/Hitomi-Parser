"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HMNetWorkError = exports.HMAPIError = exports.HMInvalidQueryError = exports.HMParseError = void 0;
class HMParseError extends Error {
    constructor(message) {
        super(message);
        this.name = "HMParseError";
    }
}
exports.HMParseError = HMParseError;
class HMInvalidQueryError extends Error {
    constructor(message) {
        super(message);
        this.name = "HMInvalidQueryError";
    }
}
exports.HMInvalidQueryError = HMInvalidQueryError;
class HMAPIError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = "HMAPIError";
        this.statusCode = statusCode;
    }
}
exports.HMAPIError = HMAPIError;
class HMNetWorkError extends Error {
    constructor(errorCode, message) {
        super(message);
        this.name = "HMNetWorkError";
        this.errorCode = errorCode;
    }
}
exports.HMNetWorkError = HMNetWorkError;
