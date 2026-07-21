const https = require("https");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.NVIDIA_API_KEY || process.env.REACT_APP_NVIDIA_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "NVIDIA_API_KEY not configured" });
    return;
  }

  const body = JSON.stringify(req.body);

  const options = {
    hostname: "integrate.api.nvidia.com",
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      host: "integrate.api.nvidia.com",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const proxyBody = Buffer.concat(chunks);
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders["transfer-encoding"];
      delete responseHeaders["connection"];
      res.writeHead(proxyRes.statusCode, responseHeaders);
      res.end(proxyBody);
    });
  });

  proxyReq.on("error", (err) => {
    res.status(500).json({ error: "Proxy error: " + err.message });
  });

  proxyReq.end(body);
};
