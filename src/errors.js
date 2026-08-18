export class CodeGraphError extends Error {
  constructor(code, message, exitCode = 1, details = undefined, cause = undefined) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CodeGraphError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}
