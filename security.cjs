"use strict";

// LangChain needs arithmetic evaluation, never native JavaScript compilation.
module.exports = function lockExpressionCompilation(scopedRequire) {
  const { Parser } = scopedRequire("expr-eval");
  const prototype = Object.getPrototypeOf(Parser.parse("0"));
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "toJSFunction");
  if (descriptor && descriptor.configurable === false) return;
  Object.defineProperty(prototype, "toJSFunction", {
    value() {
      throw new Error("Native expression compilation is disabled");
    },
    writable: false,
    configurable: false,
  });
};
