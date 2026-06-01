#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildOutputs } from "./generator";
import { inspectRepository } from "./inspector";
import { SUPPORTED_TARGETS, type GeneratedOutput, type Target } from "./types";
import { checkOutputs, writeOutputs } from "./writer";

interface CliOptions {
  repoPath?: string;
  write: boolean;
  check: boolean;
  force: boolean;
  stdout: boolean;
  targets: Target[];
  output?: string;
  help: boolean;
  version: boolean;
}

interface Streams {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

const DEFAULT_OPTIONS: CliOptions = {
  write: false,
  check: false,
  force: false,
  stdout: false,
  targets: ["agents"],
  help: false,
  version: false
};

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  streams: Streams = { stdout: process.stdout, stderr: process.stderr },
  cwd: string = process.cwd()
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    streams.stderr.write(`${(error as Error).message}\n\n${helpText()}`);
    return 2;
  }

  if (options.help) {
    streams.stdout.write(helpText());
    return 0;
  }

  if (options.version) {
    streams.stdout.write(`${await readPackageVersion()}\n`);
    return 0;
  }

  if (options.write && options.check) {
    streams.stderr.write("--write and --check cannot be used together.\n");
    return 2;
  }

  try {
    const repoRoot = path.resolve(cwd, options.repoPath ?? ".");
    const facts = await inspectRepository(repoRoot);
    const outputs = buildOutputs(facts, options.targets, { agentsOutputPath: options.output });

    if (options.stdout || (!options.write && !options.check)) {
      streams.stdout.write(formatStdout(outputs, facts.root));
    }

    if (options.check) {
      const report = await checkOutputs(outputs);
      if (report.missing.length > 0 || report.stale.length > 0) {
        streams.stderr.write(formatCheckFailure(report.missing, report.stale, facts.root));
        return 1;
      }
      streams.stdout.write(`repo-to-agents check passed for ${report.unchanged.length} file(s).\n`);
    }

    if (options.write) {
      const report = await writeOutputs(outputs, { force: options.force });
      if (report.protected.length > 0) {
        streams.stderr.write(formatProtectedFailure(report.protected, facts.root));
        return 1;
      }
      streams.stdout.write(
        `repo-to-agents wrote ${report.written.length} file(s); ${report.unchanged.length} already up to date.\n`
      );
    }

    return 0;
  } catch (error) {
    streams.stderr.write(`repo-to-agents failed: ${(error as Error).message}\n`);
    return 1;
  }
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { ...DEFAULT_OPTIONS, targets: [...DEFAULT_OPTIONS.targets] };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      options.version = true;
      continue;
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--stdout") {
      options.stdout = true;
      continue;
    }
    if (arg === "--targets") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--targets requires a comma-separated value.");
      }
      options.targets = parseTargets(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--targets=")) {
      options.targets = parseTargets(arg.slice("--targets=".length));
      continue;
    }
    if (arg === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--output requires a path.");
      }
      options.output = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    throw new Error(`Expected at most one repository path, received ${positional.length}.`);
  }

  options.repoPath = positional[0];
  return options;
}

function parseTargets(value: string): Target[] {
  const targets = value
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    throw new Error("--targets requires at least one target.");
  }

  for (const target of targets) {
    if (!isTarget(target)) {
      throw new Error(`Unsupported target "${target}". Supported targets: ${SUPPORTED_TARGETS.join(", ")}.`);
    }
  }

  return [...new Set(targets)] as Target[];
}

function isTarget(value: string): value is Target {
  return SUPPORTED_TARGETS.includes(value as Target);
}

function formatStdout(outputs: readonly GeneratedOutput[], repoRoot: string): string {
  if (outputs.length === 1) {
    return outputs[0].content;
  }

  return outputs
    .map((output) => `<!-- repo-to-agents output: ${relative(repoRoot, output.path)} -->\n${output.content}`)
    .join("\n");
}

function formatCheckFailure(missing: Array<{ path: string }>, stale: Array<{ path: string }>, repoRoot: string): string {
  const lines = ["repo-to-agents check failed."];
  if (missing.length > 0) {
    lines.push("Missing files:", ...missing.map((file) => `- ${relative(repoRoot, file.path)}`));
  }
  if (stale.length > 0) {
    lines.push("Stale files:", ...stale.map((file) => `- ${relative(repoRoot, file.path)}`));
  }
  lines.push("Run repo-to-agents --write to update generated files.");
  return `${lines.join("\n")}\n`;
}

function formatProtectedFailure(protectedFiles: Array<{ path: string }>, repoRoot: string): string {
  return [
    "repo-to-agents refused to overwrite existing files without the generated marker.",
    ...protectedFiles.map((file) => `- ${relative(repoRoot, file.path)}`),
    "Re-run with --force to replace them, or remove/rename the protected files."
  ].join("\n") + "\n";
}

function relative(root: string, filePath: string): string {
  const relativePath = path.relative(root, filePath);
  if (relativePath.startsWith("..")) {
    return filePath;
  }
  return relativePath.split(path.sep).join("/");
}

async function readPackageVersion(): Promise<string> {
  try {
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const content = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function helpText(): string {
  return `repo-to-agents

Usage:
  repo-to-agents [repo-path] [options]

Options:
  --write                      Create or update generated instruction files.
  --check                      Exit nonzero when generated files are missing or stale.
  --force                      Allow --write to replace existing unmarked files.
  --stdout                     Print generated output to stdout.
  --targets <list>             Comma-separated targets: agents,copilot,cursor,claude.
  --output <path>              Output path for AGENTS.md when target "agents" is selected.
  --version, -v                Print the CLI version.
  --help, -h                   Show this help.

Examples:
  repo-to-agents --stdout
  repo-to-agents ../my-repo --write --targets agents,copilot,cursor
  repo-to-agents --check --targets agents,claude
`;
}

if (require.main === module) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
