import { describe, expect, test } from "bun:test";

describe("Hermes plugin env surface", () => {
  test("documents and forwards CLAWMEM_LLM_MODEL", async () => {
    const file = Bun.file(`${import.meta.dir}/../../src/hermes/__init__.py`);
    const content = await file.text();

    expect(content).toContain("CLAWMEM_LLM_MODEL");
    expect(content).toContain('"env_var": "CLAWMEM_LLM_MODEL"');
  });
});
