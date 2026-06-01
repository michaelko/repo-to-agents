import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { generateAgents } from "../src/generator";
import { inspectRepository } from "../src/inspector";
import { GENERATED_MARKER } from "../src/types";

const fixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "node-app");
const pythonFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "python-api");
const goFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "go-cli");
const workspaceFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "workspace-repo");

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

  it("generates useful commands for Python repositories", async () => {
    const facts = await inspectRepository(pythonFixtureRoot);
    const output = generateAgents(facts);

    assert.ok(output.includes("Python project: fixture-python-api"));
    assert.ok(output.includes("`python -m pip install -r requirements.txt`"));
    assert.ok(output.includes("`pytest`"));
  });

  it("generates useful commands for Go repositories", async () => {
    const facts = await inspectRepository(goFixtureRoot);
    const output = generateAgents(facts);

    assert.ok(output.includes("Go module: example.com/fixture-go-cli"));
    assert.ok(output.includes("`go test ./...`"));
    assert.ok(output.includes("`cmd/`: command entry points"));
    assert.ok(output.includes("`internal/`: private implementation packages"));
  });

  it("includes workspace package names in generated architecture maps", async () => {
    const facts = await inspectRepository(workspaceFixtureRoot);
    const output = generateAgents(facts);

    assert.ok(output.includes("Workspaces: pnpm via package.json workspaces"));
    assert.ok(output.includes("`apps/web/`: workspace application; package name `@fixture/web`."));
    assert.ok(output.includes("`packages/ui/`: workspace package; package name `@fixture/ui`."));
  });
});
