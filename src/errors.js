export class CodeGraphError extends Error {
  constructor(code, message, exitCode = 1, details = undefined) {
    super(message);
    this.name = "CodeGraphError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}
