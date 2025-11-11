/**
 * Base class for error handling, providing structured error information and logging.
 * @class ErrorBase
 * @property {string} code - The error code.
 * @property {string | undefined} message - The error message (optional).
 * @property {unknown} thrownError - The original error object, if any (optional).
 * 
 * @constructor
 * @param {string} code - The error code.
 * @param {string} [message] - The error message.
 * @param {unknown} [thrownError] - The original error object, if any.
 * @param {boolean} [log=true] - Whether to log the error upon creation.
 */
export class ErrorBase {
    code: string;
    message?: string | undefined;
    thrownError?: unknown;

    constructor(code: string, message?: string, thrownError?: unknown, log: boolean = true) {
        this.code = code;
        this.message = message;
        this.thrownError = thrownError;

        if (log) {
            this.logError();
        }
    }

    /**
     * Converts the error to a string representation, on the format "Error {code}: {message}".
     * @returns a string representation of the error
     */
    toString(): string {
        return `Error ${this.code}: ${this.message ?? ''}`;
    }

    /**
     * Logs the error to the console, uses console.error and ErrorBase.toString() internally.
     * Logs thrownError if it was provided on creation.
     */
    logError(): void {
        if (this.thrownError) {
            console.error(this.toString(), this.thrownError);
        } else {
            console.error(this.toString());
        }
    }
}
