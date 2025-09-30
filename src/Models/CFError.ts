type ErrorName = 'Config' | 'Bank' | 'UserErr' | 'AIErr' | 'APIErr';

export class CFError extends Error {
  name: ErrorName;
  message: string;
  cause: unknown;

  constructor(name: ErrorName, message: string, cause?: unknown) {
    super();
    this.name = name;
    // TODO: make this better
    this.message = name + ':' + message;
    this.cause = cause;
  }
}
