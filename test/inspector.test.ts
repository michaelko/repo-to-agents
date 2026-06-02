import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectRepository } from "../src/inspector";

const fixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "node-app");
const pythonFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "python-api");
const goFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "go-cli");
const workspaceFixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "workspace-repo");

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

  it("detects package workspaces and package names", async () => {
    const facts = await inspectRepository(workspaceFixtureRoot);

    assert.equal(facts.name, "fixture-workspace");
    assert.equal(facts.workspaces?.manager, "pnpm");
    assert.equal(facts.workspaces?.source, "package.json workspaces");
    assert.deepEqual(facts.workspaces?.patterns, ["apps/*", "packages/*"]);
    assert.deepEqual(
      facts.workspaces?.packages.map((workspacePackage) => [workspacePackage.path, workspacePackage.name]),
      [
        ["apps/web", "@fixture/web"],
        ["packages/ui", "@fixture/ui"]
      ]
    );
  });

  it("applies double-star workspace exclusions without excluding unrelated packages", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "repo-to-agents-workspaces-"));
    await mkdir(path.join(root, "packages", "app", "test", "fixture"), { recursive: true });
    await mkdir(path.join(root, "packages", "ui"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "fixture-pnpm", packageManager: "pnpm@9.1.0" })
    );
    await writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/**'\n  - '!**/test/**'\n"
    );
    await writeFile(path.join(root, "packages", "app", "package.json"), JSON.stringify({ name: "@fixture/app" }));
    await writeFile(path.join(root, "packages", "ui", "package.json"), JSON.stringify({ name: "@fixture/ui" }));
    await writeFile(
      path.join(root, "packages", "app", "test", "fixture", "package.json"),
      JSON.stringify({ name: "@fixture/test-helper" })
    );

    const facts = await inspectRepository(root);

    assert.deepEqual(
      facts.workspaces?.packages.map((workspacePackage) => [workspacePackage.path, workspacePackage.name]),
      [
        ["packages/app", "@fixture/app"],
        ["packages/ui", "@fixture/ui"]
      ]
    );
  });
});
