const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

/**
 * Key generator: uses JWT user ID if available, falls back to IP
 * (IPv6-safe via ipKeyGenerator helper).
 */
const jwtKeyGenerator = (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123');
      return `user_${decoded.id}`;
    }
  } catch (_) {}
  return ipKeyGenerator(req, res);
};

/**
 * AI rate limiter: 20 requests per hour per authenticated user (or IP fallback).
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: jwtKeyGenerator,
  message: {
    error: 'Too many AI requests. Limit: 20 per hour. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API limiter: 100 requests per 15 minutes per user/IP.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: jwtKeyGenerator,
  message: {
    error: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { aiLimiter, generalLimiter };
