// In-memory request frequency tracker
const tracker = new Map<string, number[]>();

/**
 * Checks if a request from a given IP is within the allowed rate limits.
 * Default limits: 30 requests per minute.
 * 
 * @param ip Client IP address
 * @param limit Allowed request count
 * @param windowMs Time window in milliseconds
 * @returns boolean true if request is allowed, false if rate limit is exceeded
 */
export function rateLimit(ip: string, limit: number = 30, windowMs: number = 60 * 1000): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const timestamps = tracker.get(ip) || [];
  
  // Keep only timestamps within the current sliding window
  const recentTimestamps = timestamps.filter(t => t > windowStart);
  
  if (recentTimestamps.length >= limit) {
    return false;
  }
  
  recentTimestamps.push(now);
  tracker.set(ip, recentTimestamps);
  return true;
}
