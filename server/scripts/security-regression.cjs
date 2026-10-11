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
verifyOfficeImports().catch((error) => { console.error(error); process.exitCode = 1; });
