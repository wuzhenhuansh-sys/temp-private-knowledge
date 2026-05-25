export function errorResponse(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}
