console.log("[setupProxy] LOADED - setting up NVIDIA proxy...");

const https = require("https");

module.exports = function (app) {
  console.log("[setupProxy] Express app received, registering middleware");

  app.use((req, res, next) => {
    if (!req.url.startsWith("/api/nvidia")) {
      return next();
    }

    console.log("[setupProxy] PROXYING:", req.method, req.url);

    const apiKey = process.env.NVIDIA_API_KEY || process.env.REACT_APP_NVIDIA_API_KEY;

    const completeRequest = (body) => {
      const targetPath = req.url.replace(/^\/api\/nvidia/, "/v1");
      console.log("[setupProxy] Target path:", targetPath);

      const options = {
        hostname: "integrate.api.nvidia.com",
        path: targetPath,
        method: req.method,
        headers: {
          host: "integrate.api.nvidia.com",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": req.headers["content-type"] || "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };

      console.log("[setupProxy] Forwarding to:", options.hostname + options.path);

      const proxyReq = https.request(options, (proxyRes) => {
        console.log("[setupProxy] Response status:", proxyRes.statusCode);
        const proxyChunks = [];
        proxyRes.on("data", (chunk) => proxyChunks.push(chunk));
        proxyRes.on("end", () => {
          const proxyBody = Buffer.concat(proxyChunks);
          const responseHeaders = { ...proxyRes.headers };
          delete responseHeaders["transfer-encoding"];
          delete responseHeaders["connection"];
          res.writeHead(proxyRes.statusCode, responseHeaders);
          res.end(proxyBody);
        });
      });

      proxyReq.on("error", (err) => {
        console.error("[setupProxy] Error:", err.message);
        res.status(500).json({ error: "Proxy error: " + err.message });
      });

      proxyReq.end(body);
    };

    if (req.body) {
      console.log("[setupProxy] Using pre-parsed body");
      completeRequest(JSON.stringify(req.body));
    } else {
      console.log("[setupProxy] Reading raw body");
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        completeRequest(Buffer.concat(chunks));
      });
    }
  });
};
