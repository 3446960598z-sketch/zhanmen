#!/usr/bin/env node
/** Dedicated HTTP port in front of the loopback panel. */
import http from "node:http";

const upstreamPort = Number(process.env.PANEL_UPSTREAM_PORT || 8081);
const listenPort = Number(process.env.PUBLIC_PORT || 8443);

function proxy(req, res) {
  const headers = { ...req.headers };
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-host"] = req.headers.host || `127.0.0.1:${listenPort}`;
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: req.url,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("panel is starting");
  });
  req.pipe(upstream);
}

http.createServer(proxy).listen(listenPort, "0.0.0.0", () => {
  console.log(`panel port ${listenPort}`);
});
