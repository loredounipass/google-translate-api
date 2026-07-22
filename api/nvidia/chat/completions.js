const https = require("https");
const crypto = require("crypto");

// 1. In-memory Cache
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;
const cache = new Map();

// 2. Request Coalescing
const pendingRequests = new Map();

// 3. Global Rate Limiter
const RATE_LIMIT_MAX = 50; // Max requests per window
const RATE_LIMIT_WINDOW = 60000; // 1 minute
let requestsInWindow = 0;
let windowStartTime = Date.now();

const generateCacheKey = (bodyObj) => {
  return crypto.createHash("sha256").update(JSON.stringify(bodyObj || {})).digest("hex");
};

const cleanupCache = () => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now > value.expiry) {
      cache.delete(key);
    }
  }
  if (cache.size > MAX_CACHE_SIZE) {
    const keysToRemove = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHE_SIZE);
    keysToRemove.forEach(k => cache.delete(k));
  }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.NVIDIA_API_KEY || process.env.REACT_APP_NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "NVIDIA_API_KEY not configured" });
  }

  // --- Rate Limiting ---
  const now = Date.now();
  if (now - windowStartTime > RATE_LIMIT_WINDOW) {
    requestsInWindow = 0;
    windowStartTime = now;
  }
  requestsInWindow++;
  
  if (requestsInWindow > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too Many Requests" });
  }

  // --- Cache & Coalescing ---
  const cacheKey = generateCacheKey(req.body);
  
  cleanupCache();
  
  // Return from Cache
  if (cache.has(cacheKey)) {
    const cachedResponse = cache.get(cacheKey);
    return res.status(cachedResponse.statusCode).json(cachedResponse.data);
  }

  // Wait for Pending Request (Coalescing)
  if (pendingRequests.has(cacheKey)) {
    try {
      const response = await pendingRequests.get(cacheKey);
      return res.status(response.statusCode).json(response.data);
    } catch (error) {
      return res.status(500).json({ error: "Coalesced request failed: " + error.message });
    }
  }

  // --- Make API Request ---
  const requestPromise = new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(req.body);

    const options = {
      hostname: "integrate.api.nvidia.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        host: "integrate.api.nvidia.com",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        try {
          const proxyBody = Buffer.concat(chunks);
          let data;
          
          if (proxyRes.statusCode === 200) {
            data = JSON.parse(proxyBody.toString());
            // Store successful requests in cache
            cache.set(cacheKey, {
              statusCode: proxyRes.statusCode,
              data: data,
              expiry: Date.now() + CACHE_TTL
            });
          } else {
            // Handle error JSON
            try { data = JSON.parse(proxyBody.toString()); } 
            catch { data = proxyBody.toString(); }
          }
          
          resolve({ statusCode: proxyRes.statusCode, data });
        } catch (err) {
          reject(err);
        }
      });
    });

    proxyReq.on("error", reject);
    proxyReq.end(bodyStr);
  });

  // Store promise for concurrent identical requests
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const response = await requestPromise;
    pendingRequests.delete(cacheKey);
    return res.status(response.statusCode).json(response.data);
  } catch (err) {
    pendingRequests.delete(cacheKey);
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
};
