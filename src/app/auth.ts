import { createMiddleware } from "hono/factory";

export type AppVariables = Record<string, never>;

export const requireAuth = createMiddleware(async (_c, next) => {
  await next();
});
