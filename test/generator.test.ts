import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { generateAgents } from "../src/generator";
import { inspectRepository } from "../src/inspector";
import { GENERATED_MARKER } from "../src/types";

const fixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "node-app");

describe("generateAgents", () => {
  it("creates deterministic agent guidance with expected sections and commands", async () => {
    const facts = await inspectRepository(fixtureRoot);
    const first = generateAgents(facts);
    const second = generateAgents(facts);

    assert.equal(first, second);
    assert.ok(first.includes("# AGENTS.md"));
    assert.ok(first.includes(GENERATED_MARKER));
    assert.ok(first.includes("## Detected Stack"));
    assert.ok(first.includes("## Commands"));
    assert.ok(first.includes("## Architecture Map"));
    assert.ok(first.includes("## Coding Conventions"));
    assert.ok(first.includes("`pnpm install`"));
    assert.ok(first.includes("`pnpm test`"));
    assert.ok(first.includes("`.github/workflows/ci.yml`"));
  });
});
