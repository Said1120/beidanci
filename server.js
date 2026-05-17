const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const host = "127.0.0.1";
const port = Number(process.env.PORT || 8765);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requested = path.normalize(path.join(root, decodeURIComponent(pathname)));
  const relative = path.relative(root, requested);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(requested, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const contentType = types[path.extname(requested)] || "application/octet-stream";
    response.writeHead(200, { "content-type": contentType });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`中考背单词已启动：http://${host}:${port}`);
});
