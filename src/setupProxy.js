console.log("[setupProxy] LOADED - setting up NVIDIA proxy with Cache & Rate Limit...");

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

const generateCacheKey = (bodyStr) => {
  return crypto.createHash("sha256").update(bodyStr || "").digest("hex");
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

module.exports = function (app) {
  console.log("[setupProxy] Express app received, registering middleware");

  app.use(async (req, res, next) => {
    if (!req.url.startsWith("/api/nvidia")) {
      return next();
    }

    console.log("[setupProxy] PROXYING:", req.method, req.url);

    const apiKey = process.env.NVIDIA_API_KEY || process.env.REACT_APP_NVIDIA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "NVIDIA_API_KEY not configured" });
      return;
    }

    // --- Rate Limiting ---
    const now = Date.now();
    if (now - windowStartTime > RATE_LIMIT_WINDOW) {
      requestsInWindow = 0;
      windowStartTime = now;
    }
    requestsInWindow++;
    
    if (requestsInWindow > RATE_LIMIT_MAX) {
      res.status(429).json({ error: "Too Many Requests" });
      return;
    }

    const processRequest = async (bodyBuffer) => {
      const bodyStr = bodyBuffer.toString();
      const cacheKey = generateCacheKey(bodyStr);
      
      cleanupCache();
      
      // Return from Cache
      if (cache.has(cacheKey)) {
        console.log("[setupProxy] Cache HIT for:", req.url);
        const cachedResponse = cache.get(cacheKey);
        res.status(cachedResponse.statusCode).json(cachedResponse.data);
        return;
      }

      // Wait for Pending Request (Coalescing)
      if (pendingRequests.has(cacheKey)) {
        console.log("[setupProxy] Coalescing request for:", req.url);
        try {
          const response = await pendingRequests.get(cacheKey);
          res.status(response.statusCode).json(response.data);
        } catch (error) {
          res.status(500).json({ error: "Coalesced request failed: " + error.message });
        }
        return;
      }

      console.log("[setupProxy] Cache MISS, forwarding to NVIDIA API");

      // --- Make API Request ---
      const requestPromise = new Promise((resolve, reject) => {
        const targetPath = req.url.replace(/^\/api\/nvidia/, "/v1");
        
        const options = {
          hostname: "integrate.api.nvidia.com",
          path: targetPath,
          method: req.method,
          headers: {
            host: "integrate.api.nvidia.com",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": req.headers["content-type"] || "application/json",
            "Content-Length": Buffer.byteLength(bodyBuffer),
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
        proxyReq.end(bodyBuffer);
      });

      // Store promise for concurrent identical requests
      pendingRequests.set(cacheKey, requestPromise);

      try {
        const response = await requestPromise;
        pendingRequests.delete(cacheKey);
        res.status(response.statusCode).json(response.data);
      } catch (err) {
        pendingRequests.delete(cacheKey);
        console.error("[setupProxy] Error:", err.message);
        res.status(500).json({ error: "Proxy error: " + err.message });
      }
    };

    if (req.body) {
      console.log("[setupProxy] Using pre-parsed body");
      processRequest(Buffer.from(JSON.stringify(req.body)));
    } else {
      console.log("[setupProxy] Reading raw body");
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        processRequest(Buffer.concat(chunks));
      });
    }
  });
};
