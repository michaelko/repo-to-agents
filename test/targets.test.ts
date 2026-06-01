import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { buildOutputs } from "../src/generator";
import { inspectRepository } from "../src/inspector";

const fixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "node-app");

describe("target generation", () => {
  it("builds the requested target files", async () => {
    const facts = await inspectRepository(fixtureRoot);
    const outputs = buildOutputs(facts, ["agents", "copilot", "cursor", "claude"]);
    const relativePaths = outputs.map((output) => path.relative(fixtureRoot, output.path).split(path.sep).join("/"));

    assert.deepEqual(relativePaths, [
      "AGENTS.md",
      ".github/copilot-instructions.md",
      ".cursor/rules/repository.mdc",
      "CLAUDE.md"
    ]);
    assert.ok(outputs.find((output) => output.target === "copilot")?.content.includes("# Copilot Instructions"));
    assert.ok(outputs.find((output) => output.target === "cursor")?.content.startsWith("---\n"));
    assert.ok(outputs.find((output) => output.target === "claude")?.content.includes("# CLAUDE.md"));
  });

  it("uses --output paths for AGENTS.md only", async () => {
    const facts = await inspectRepository(fixtureRoot);
    const outputs = buildOutputs(facts, ["agents", "claude"], { agentsOutputPath: "docs/AGENTS.generated.md" });

    assert.equal(path.relative(fixtureRoot, outputs[0].path).split(path.sep).join("/"), "docs/AGENTS.generated.md");
    assert.equal(path.relative(fixtureRoot, outputs[1].path).split(path.sep).join("/"), "CLAUDE.md");
  });
});
