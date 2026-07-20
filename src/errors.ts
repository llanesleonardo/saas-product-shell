/**
 * Minimal shell errors — products may map to their own AppError.
 */
export class ShellError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: string[] } = {},
  ) {
    super(message);
    this.name = "ShellError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "SHELL_ERROR";
    this.details = options.details ?? [];
  }

  static unauthorized(message = "Sign in required.") {
    return new ShellError(message, { status: 401, code: "UNAUTHORIZED" });
  }

  static validation(message: string, details: string[] = []) {
    return new ShellError(message, { status: 400, code: "VALIDATION", details });
  }

  static notFound(resource = "Resource") {
    return new ShellError(`${resource} not found`, { status: 404, code: "NOT_FOUND" });
  }

  static forbidden(message = "Forbidden") {
    return new ShellError(message, { status: 403, code: "FORBIDDEN" });
  }
}

export function jsonError(err: unknown): Response {
  if (err instanceof ShellError) {
    return Response.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return Response.json({ error: message, code: "INTERNAL" }, { status: 500 });
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw ShellError.validation("Invalid JSON body");
  }
}
