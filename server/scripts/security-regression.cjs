"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createRequire } = require("node:module");
const lockCompilation = require("../../security.cjs");
for (const part of ["server", "collector"]) {
  const scoped = createRequire(path.resolve(__dirname, "../..", part, "index.js"));
  const { Parser } = scoped("expr-eval");
  lockCompilation(scoped);
  lockCompilation(scoped);
  assert.equal(Parser.evaluate("2 * (3 + 4)"), 14);
  const expression = Parser.parse("x + 1");
  assert.equal(expression.evaluate({ x: 6 }), 7);
  assert.throws(() => expression.toJSFunction("x"), /compilation is disabled/);
  assert.throws(() => { Object.getPrototypeOf(expression).toJSFunction = () => 1; }, TypeError);
  // Known ONNX wire data exercises generated v6 bindings against patched v7.
  const { onnx } = scoped("onnx-proto");
  const wire = Buffer.from("0809120973796e7468657469633a0b120973796e746865746963", "hex");
  const model = onnx.ModelProto.decode(wire);
  assert.equal(String(model.irVersion), "9");
  assert.equal(model.producerName, "synthetic");
  assert.equal(model.graph.name, "synthetic");
  assert.deepEqual(Buffer.from(onnx.ModelProto.encode(model).finish()), wire);
}
async function verifyOfficeImports() {
  const collector = createRequire(path.resolve(__dirname, "../../collector/index.js"));
  const office = collector("officeparser");
  const Zip = require("adm-zip");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-security-"));
  const fixtures = {
    docx: ["word/document.xml", '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Synthetic Grüße</w:t></w:r></w:p></w:body></w:document>'],
    pptx: ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Synthetic Grüße</a:t></a:r></a:p></p:sld>'],
    odt: ["content.xml", '<office:document-content xmlns:office="urn:office" xmlns:text="urn:text"><office:body><office:text><text:p>Synthetic Grüße</text:p></office:text></office:body></office:document-content>'],
  };
  try {
    for (const [extension, [name, content]] of Object.entries(fixtures)) {
      const archive = new Zip();
      archive.addFile(name, Buffer.from(content));
      const file = path.join(directory, `synthetic.${extension}`);
      archive.writeZip(file);
      assert.equal((await office.parseOfficeAsync(file)).trim(), "Synthetic Grüße");
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("PASS expression guard, ONNX wire compatibility and DOCX/PPTX/ODT imports");
}
async function verifyUploadParser() {
  // Keep a vulnerable parser's synchronous loop bounded in its own process.
  const { execFile } = require("node:child_process");
  const { promisify } = require("node:util");
  const program = `
    const assert = require("node:assert/strict");
    const http = require("node:http");
    const multer = require("multer");
    const upload = multer({limits: {fieldArrayIndexLimit: 0}}).single("file");
    const server = http.createServer((req, res) => upload(req, res, (error) => {
      res.writeHead(error ? 400 : 200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(error ? {denied: true} : {
        greeting: req.body.greeting,
        file: req.file?.buffer.toString("utf8"),
      }));
    }));
    (async () => {
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      const url = "http://127.0.0.1:" + server.address().port;
      const valid = new FormData();
      valid.append("greeting", "Synthetic Grüße");
      valid.append("file", new Blob(["Synthetic file"]), "synthetic.txt");
      const accepted = await fetch(url, {method: "POST", body: valid});
      assert.equal(accepted.status, 200);
      assert.deepEqual(await accepted.json(), {greeting: "Synthetic Grüße", file: "Synthetic file"});
      for (const index of ["1", "4294967294"]) {
        const malformed = new FormData();
        malformed.append("items[" + index + "]", "synthetic");
        malformed.append("items[label]", "synthetic");
        assert.equal((await fetch(url, {method: "POST", body: malformed})).status, 400);
      }
      const next = new FormData(); next.append("greeting", "Still responsive");
      assert.equal((await fetch(url, {method: "POST", body: next})).status, 200);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    })().catch(error => { console.error(error); process.exit(1); });
  `;
  await promisify(execFile)(process.execPath, ["-e", program], {
    cwd: path.resolve(__dirname, ".."), timeout: 5000,
  });
  console.log("PASS multipart file/Unicode upload and bounded malformed-field rejection");
}
Promise.resolve().then(verifyUploadParser).then(verifyOfficeImports).catch((error) => { console.error(error); process.exitCode = 1; });
