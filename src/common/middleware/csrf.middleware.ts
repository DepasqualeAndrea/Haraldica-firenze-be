import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const DEFAULT_IGNORED_PATHS = [
  '/health',
  '/webhooks/stripe',
  '/api/v1/auth/csrf',
  '/api/v1/auth/guest-token',
  '/api/v1/auth/guest-token/validate',
  '/api/v1/auth/refresh',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  // Admin dashboard routes: protette da JWT Bearer token, CSRF non necessario
  '/api/v1/admin',
  '/api/v1/upload',
  '/api/v1/inventory',
  '/api/v1/categories',
  // User authenticated routes: protette da JWT Bearer token, CSRF non necessario
  '/api/v1/cart',
  '/api/v1/orders',
  '/api/v1/addresses',
  '/api/v1/users',
  '/api/v1/wishlists',
  '/api/v1/reviews',
  '/api/v1/returns',
  '/api/v1/payments',
];

export function csrfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (SAFE_METHODS.has(req.method)) return next();

  const path = req.originalUrl || req.url || '';
  if (DEFAULT_IGNORED_PATHS.some((p) => path.startsWith(p))) {
    return next();
  }

  const csrfCookie = req.cookies?.csrfToken;
  const csrfHeader = req.header('x-csrf-token');

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ message: 'CSRF token non valido' });
  }

  return next();
}
