const { spawn } = require("node:child_process");
const { once } = require("node:events");
const http = require("node:http");
const path = require("node:path");

const helper = path.resolve(__dirname, "../utils/boot/managedShutdown.js");

async function exercise(failCleanup) {
  const child = spawn(process.execPath, ["-e", `
    const http = require('node:http');
    const { managedShutdown } = require(${JSON.stringify(helper)});
    const server = http.createServer((_req, res) => {
      console.log('request-started');
      setTimeout(() => res.end('synthetic-drained'), 100);
    });
    managedShutdown(server, async () => {
      console.log('database-disconnected');
      if (${failCleanup}) throw new Error('synthetic cleanup failure');
    });
    server.listen(0, '127.0.0.1', () => console.log('port:' + server.address().port));
  `], { env: { PATH: process.env.PATH, ONE_MANAGED_RUNTIME: "true" } });
  const exited = once(child, "exit");
  let output = "";
  let request;
  child.stderr.resume();
  child.stdout.on("data", (chunk) => {
    output += chunk;
    const port = output.match(/port:(\d+)/);
    if (port && !request) {
      request = new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port[1]}`, (res) => {
          let body = "";
          res.on("data", (data) => body += data);
          res.on("end", () => resolve(body));
        }).on("error", reject);
      });
    }
    if (output.includes("request-started")) child.kill("SIGTERM");
  });
  try {
    const [code, signal] = await exited;
    expect(signal).toBeNull();
    expect(code).toBe(failCleanup ? 1 : 0);
    expect(await request).toBe("synthetic-drained");
    expect(output).toContain("database-disconnected");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

test("managed shutdown drains active HTTP before database disconnect and clean exit", () => exercise(false), 10000);
test("failed database cleanup cannot look like a clean backup stop", () => exercise(true), 10000);
test("legacy runtime does not acquire new signal handlers", () => {
  const previous = process.env.ONE_MANAGED_RUNTIME;
  delete process.env.ONE_MANAGED_RUNTIME;
  try {
    const before = process.listenerCount("SIGTERM");
    require(helper).managedShutdown({});
    expect(process.listenerCount("SIGTERM")).toBe(before);
  } finally {
    if (previous === undefined) delete process.env.ONE_MANAGED_RUNTIME;
    else process.env.ONE_MANAGED_RUNTIME = previous;
  }
});
