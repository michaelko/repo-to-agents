import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectRepository } from "../src/inspector";

const fixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "node-app");
const pythonFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "python-api");
const goFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "go-cli");

describe("inspectRepository", () => {
  it("detects Node, TypeScript, test, Docker, Makefile, and CI facts", async () => {
    const facts = await inspectRepository(fixtureRoot);

    assert.equal(facts.name, "fixture-node-app");
    assert.equal(facts.packageJson?.packageManager?.name, "pnpm");
    assert.equal(facts.packageJson?.packageManager?.version, "9.1.0");
    assert.deepEqual(Object.keys(facts.packageJson?.scripts ?? {}), ["build", "dev", "lint", "test"]);
    assert.ok(facts.languages.includes("TypeScript"));
    assert.ok(facts.frameworks.includes("React"));
    assert.ok(facts.frameworks.includes("Vitest"));
    assert.ok(facts.testConfigs.includes("vitest.config.ts"));
    assert.ok(facts.githubActions.includes(".github/workflows/ci.yml"));
    assert.deepEqual(facts.make?.targets, ["build", "test"]);
    assert.deepEqual(facts.docker?.dockerfiles, ["Dockerfile"]);
    assert.ok(facts.directories.some((entry) => entry.path === "src"));
    assert.equal(facts.readme?.title, "Fixture Node App");
  });

  it("detects Python project facts and test commands", async () => {
    const facts = await inspectRepository(pythonFixtureRoot);

    assert.equal(facts.name, "fixture-python-api");
    assert.equal(facts.python?.manager, "pip");
    assert.equal(facts.python?.pyproject, true);
    assert.deepEqual(facts.python?.requirementsFiles, ["requirements.txt"]);
    assert.ok(facts.python?.tools.includes("ruff"));
    assert.ok(facts.languages.includes("Python"));
    assert.ok(facts.testConfigs.includes("pytest.ini"));
    assert.ok(facts.directories.some((entry) => entry.path === "src"));
    assert.ok(facts.directories.some((entry) => entry.path === "tests"));
  });

  it("detects Go module facts and command directories", async () => {
    const facts = await inspectRepository(goFixtureRoot);

    assert.equal(facts.name, "go-cli");
    assert.equal(facts.go?.modulePath, "example.com/fixture-go-cli");
    assert.ok(facts.languages.includes("Go"));
    assert.ok(facts.testConfigs.includes("go.mod"));
    assert.ok(facts.directories.some((entry) => entry.path === "cmd"));
    assert.ok(facts.directories.some((entry) => entry.path === "internal"));
  });
});
