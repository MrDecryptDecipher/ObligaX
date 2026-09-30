import rateLimit from 'express-rate-limit';

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // limit each IP or token to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'ERR_RATE_LIMIT_EXCEEDED',
      message: 'Too many requests created from this IP/client, please retry after 1 minute.',
      timestamp: new Date().toISOString()
    }
  }
});
