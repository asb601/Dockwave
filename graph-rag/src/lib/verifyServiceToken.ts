import { timingSafeEqual } from "crypto";

/**
 * Timing-safe service token verification.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing side-channel attacks
 * that could let an attacker guess the token character by character.
 */
export function verifyServiceToken(req: Request): boolean {
  const token = req.headers.get("x-service-token");
  const expected = process.env.SERVICE_TOKEN;
  if (!expected || !token) return false;

  // timingSafeEqual requires equal-length buffers
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(tokenBuf, expectedBuf);
}
