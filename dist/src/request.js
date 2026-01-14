"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadWithTimeout = exports.fakeFetch = void 0;
const error_1 = require("./error");
var ENV;
(function (ENV) {
    ENV[ENV["NODE"] = 0] = "NODE";
    ENV[ENV["JSBOX"] = 1] = "JSBOX";
})(ENV || (ENV = {}));
let env;
if ((typeof process !== "undefined" && process.versions && process.versions.node > "17.5") ||
    typeof fetch !== "undefined") {
    env = ENV.NODE;
}
else if (typeof $http !== "undefined" && $http.request !== undefined) {
    env = ENV.JSBOX;
}
else {
    throw new Error("环境不支持");
}
class ResponseLike {
    constructor(resp) {
        this._resp = resp;
    }
    get headers() {
        // 将 Record<string, string> 转换为 Headers-like 对象
        const headersObj = this._resp.response.headers;
        return {
            get(name) {
                return headersObj[name.toLowerCase()] ?? undefined;
            },
            has(name) {
                return headersObj.hasOwnProperty(name.toLowerCase());
            },
            entries() {
                return Object.entries(headersObj);
            },
            // 可扩展更多方法以模拟 fetch 的 Headers
        };
    }
    get ok() {
        return this._resp.response.statusCode >= 200 && this._resp.response.statusCode < 299;
    }
    get status() {
        return this._resp.response.statusCode;
    }
    get statusText() {
        return this._resp.response.statusCode.toString();
    }
    get url() {
        return this._resp.response.url;
    }
    async arrayBuffer() {
        return new Uint8Array(this._resp.rawData.byteArray).buffer;
    }
    async json() {
        return this._resp.data;
    }
    async text() {
        return this._resp.data;
    }
}
async function fakeFetch(url, init) {
    if (env === ENV.NODE) {
        const resp = await fetch(url, {
            method: init?.method ?? "GET",
            headers: init?.headers,
        });
        return resp;
    }
    else if (env === ENV.JSBOX) {
        const resp = await $http.request({
            url,
            method: init?.method ?? "GET",
            header: init?.headers,
        });
        if (resp.error)
            throw new error_1.HMNetWorkError(resp.error.code, resp.error.localizedDescription);
        return new ResponseLike(resp);
    }
    else {
        throw new Error("环境不支持");
    }
}
exports.fakeFetch = fakeFetch;
// 定义一个有timeout的下载函数，通过Promise.race实现
function withTimeout(promise, timeoutMs) {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new error_1.HMTimeoutError("Timeout error on download")), timeoutMs));
    return Promise.race([promise, timeoutPromise]);
}
async function _download(url, header) {
    const resp = await $http.download({ url, header, showsProgress: false });
    if (resp.error) {
        if (resp.error.code === -1001) {
            // HttpTypes.NSURLErrorDomain.NSURLErrorTimedOut
            throw new error_1.HMTimeoutError(`Timeout Error! url: ${url}`);
        }
        else if (!resp.response || !resp.response.statusCode) {
            throw new error_1.HMNetWorkError(resp.error.code, `Network Error! \nurl: ${url}\nheader: ${JSON.stringify(header)}`);
        }
    }
    const statusCode = resp.response.statusCode;
    if (statusCode >= 400) {
        throw new error_1.HMNetWorkError(statusCode, `HTTP error! status: ${statusCode}\nurl: ${url}`);
    }
    return resp;
}
async function downloadWithTimeout({ url, header, timeout, }) {
    const resp = await withTimeout(_download(url, header), timeout * 1000);
    return resp;
}
exports.downloadWithTimeout = downloadWithTimeout;
