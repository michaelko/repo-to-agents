import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildOutputs } from "../src/generator";
import { inspectRepository } from "../src/inspector";
import { checkOutputs, writeOutputs } from "../src/writer";

const fixtureRoot = path.resolve(__dirname, "..", "..", "test", "fixtures", "node-app");
const cliPath = path.resolve(__dirname, "..", "src", "cli.js");

describe("write and check behavior", () => {
  it("writes generated files, checks freshness, and protects unmarked files", async () => {
    const tempRoot = await copyFixture();
    const facts = await inspectRepository(tempRoot);
    const outputs = buildOutputs(facts, ["agents"]);

    const firstWrite = await writeOutputs(outputs);
    assert.equal(firstWrite.written.length, 1);
    assert.equal((await checkOutputs(outputs)).stale.length, 0);

    await fs.writeFile(path.join(tempRoot, "AGENTS.md"), "manual instructions\n", "utf8");
    const stale = await checkOutputs(outputs);
    assert.equal(stale.stale.length, 1);

    const protectedWrite = await writeOutputs(outputs);
    assert.equal(protectedWrite.protected.length, 1);
    assert.equal(await fs.readFile(path.join(tempRoot, "AGENTS.md"), "utf8"), "manual instructions\n");

    const forcedWrite = await writeOutputs(outputs, { force: true });
    assert.equal(forcedWrite.written.length, 1);
    assert.equal((await checkOutputs(outputs)).stale.length, 0);
  });

  it("lets marked generated files be updated without --force", async () => {
    const tempRoot = await copyFixture();
    let facts = await inspectRepository(tempRoot);
    let outputs = buildOutputs(facts, ["agents"]);
    await writeOutputs(outputs);

    const packageJsonPath = path.join(tempRoot, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.typecheck = "tsc --noEmit";
    await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

    facts = await inspectRepository(tempRoot);
    outputs = buildOutputs(facts, ["agents"]);
    const update = await writeOutputs(outputs);

    assert.equal(update.written.length, 1);
    assert.match(await fs.readFile(path.join(tempRoot, "AGENTS.md"), "utf8"), /pnpm typecheck/);
  });
});

describe("CLI", () => {
  it("supports --write, --check, --stdout, and stale check exits", async () => {
    const tempRoot = await copyFixture();

    const write = spawnSync(process.execPath, [cliPath, tempRoot, "--write", "--targets", "agents,copilot"], {
      encoding: "utf8"
    });
    assert.equal(write.status, 0, write.stderr);
    assert.match(write.stdout, /wrote 2 file/);

    const check = spawnSync(process.execPath, [cliPath, tempRoot, "--check", "--targets", "agents,copilot"], {
      encoding: "utf8"
    });
    assert.equal(check.status, 0, check.stderr);

    const stdout = spawnSync(process.execPath, [cliPath, tempRoot, "--stdout"], { encoding: "utf8" });
    assert.equal(stdout.status, 0, stdout.stderr);
    assert.match(stdout.stdout, /# AGENTS\.md/);

    const packageJsonPath = path.join(tempRoot, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts.check = "pnpm lint && pnpm test";
    await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

    const stale = spawnSync(process.execPath, [cliPath, tempRoot, "--check", "--targets", "agents,copilot"], {
      encoding: "utf8"
    });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /Stale files/);
  });
});

async function copyFixture(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repo-to-agents-"));
  await fs.cp(fixtureRoot, tempRoot, { recursive: true });
  return tempRoot;
}
