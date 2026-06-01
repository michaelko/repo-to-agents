import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  DirectoryFacts,
  DockerFacts,
  GoFacts,
  MakeFacts,
  PackageJsonFacts,
  PackageManagerFacts,
  PythonFacts,
  ReadmeFacts,
  RepoFacts,
  RustFacts
} from "./types";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv"
]);

const TEST_CONFIG_CANDIDATES = [
  "jest.config.js",
  "jest.config.cjs",
  "jest.config.mjs",
  "jest.config.ts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.ts",
  "playwright.config.js",
  "playwright.config.ts",
  "cypress.config.js",
  "cypress.config.ts",
  "pytest.ini",
  "tox.ini",
  "noxfile.py",
  "conftest.py",
  "go.mod",
  "Cargo.toml"
];

const CONFIG_CANDIDATES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "Makefile",
  "Dockerfile",
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
  "tsconfig.json",
  ".eslintrc",
  ".eslintrc.json",
  "eslint.config.js",
  "eslint.config.mjs",
  ".prettierrc",
  ".prettierrc.json",
  "ruff.toml"
];

const DIRECTORY_PURPOSES = new Map<string, string>([
  ["src", "primary source code"],
  ["app", "application routes or app entry points"],
  ["lib", "shared library code"],
  ["packages", "workspace packages"],
  ["apps", "workspace applications"],
  ["test", "tests"],
  ["tests", "tests"],
  ["spec", "specifications or tests"],
  ["cmd", "command entry points"],
  ["internal", "private implementation packages"],
  ["docs", "documentation"],
  ["scripts", "automation scripts"],
  ["infra", "infrastructure code"],
  ["deploy", "deployment assets"],
  [".github/workflows", "GitHub Actions workflows"]
]);

export async function inspectRepository(repoPath: string = process.cwd()): Promise<RepoFacts> {
  const root = path.resolve(repoPath);
  const files = await collectFiles(root);
  const fileSet = new Set(files);
  const rootName = path.basename(root);

  const packageJson = await inspectPackageJson(root, fileSet);
  const python = await inspectPython(root, fileSet);
  const go = await inspectGo(root, fileSet);
  const rust = await inspectRust(root, fileSet);
  const make = await inspectMake(root, fileSet);
  const docker = inspectDocker(files);
  const readme = await inspectReadme(root, fileSet);
  const testConfigs = inspectTestConfigs(files);
  const githubActions = inspectGitHubActions(files);
  const directories = await inspectDirectories(root);
  const configFiles = CONFIG_CANDIDATES.filter((candidate) => fileSet.has(candidate)).sort();
  const languages = detectLanguages(files, { packageJson, python, go, rust });
  const frameworks = detectFrameworks(packageJson?.dependencies ?? [], files);

  return {
    root,
    name: packageJson?.name ?? python?.projectName ?? rust?.packageName ?? rootName,
    readme,
    packageJson,
    python,
    go,
    rust,
    make,
    docker,
    tsconfig: fileSet.has("tsconfig.json") ? "tsconfig.json" : undefined,
    testConfigs,
    githubActions,
    directories,
    languages,
    frameworks,
    configFiles,
    files
  };
}

async function inspectPackageJson(
  root: string,
  fileSet: Set<string>
): Promise<PackageJsonFacts | undefined> {
  if (!fileSet.has("package.json")) {
    return undefined;
  }

  const value = await readJson(path.join(root, "package.json"));
  const packageManager = detectPackageManager(value, fileSet);
  const scripts = normalizeStringRecord(value?.scripts);
  const dependencies = new Set<string>();

  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dependency of Object.keys(normalizeStringRecord(value?.[section]))) {
      dependencies.add(dependency);
    }
  }

  return {
    name: typeof value?.name === "string" ? value.name : undefined,
    packageManager,
    scripts,
    dependencies: [...dependencies].sort()
  };
}

async function inspectPython(root: string, fileSet: Set<string>): Promise<PythonFacts | undefined> {
  const requirementsFiles = [...fileSet].filter((file) => {
    return file === "requirements.txt" || /^requirements[-/].*\.txt$/.test(file);
  });
  const hasPyproject = fileSet.has("pyproject.toml");
  const hasPythonFiles = [...fileSet].some((file) => file.endsWith(".py"));

  if (!hasPyproject && requirementsFiles.length === 0 && !hasPythonFiles) {
    return undefined;
  }

  let projectName: string | undefined;
  const tools = new Set<string>();

  if (hasPyproject) {
    const pyproject = await readText(path.join(root, "pyproject.toml"));
    projectName = findTomlString(pyproject, "name");
    for (const match of pyproject.matchAll(/^\[tool\.([A-Za-z0-9_.-]+)]/gm)) {
      tools.add(match[1]);
    }
  }

  return {
    projectName,
    manager: detectPythonManager(fileSet),
    pyproject: hasPyproject,
    requirementsFiles: requirementsFiles.sort(),
    tools: [...tools].sort()
  };
}

async function inspectGo(root: string, fileSet: Set<string>): Promise<GoFacts | undefined> {
  if (!fileSet.has("go.mod")) {
    return undefined;
  }

  const goMod = await readText(path.join(root, "go.mod"));
  const modulePath = /^module\s+(.+)$/m.exec(goMod)?.[1]?.trim();
  return { modulePath };
}

async function inspectRust(root: string, fileSet: Set<string>): Promise<RustFacts | undefined> {
  if (!fileSet.has("Cargo.toml")) {
    return undefined;
  }

  const cargoToml = await readText(path.join(root, "Cargo.toml"));
  return { packageName: findTomlString(cargoToml, "name") };
}

async function inspectMake(root: string, fileSet: Set<string>): Promise<MakeFacts | undefined> {
  if (!fileSet.has("Makefile")) {
    return undefined;
  }

  const makefile = await readText(path.join(root, "Makefile"));
  const targets = new Set<string>();

  for (const line of makefile.split(/\r?\n/)) {
    if (line.startsWith("\t") || line.trim().startsWith("#") || line.includes(":=")) {
      continue;
    }
    const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*):(?:\s|$)/.exec(line);
    if (match && !match[1].startsWith(".")) {
      targets.add(match[1]);
    }
  }

  return { targets: [...targets].sort().slice(0, 20) };
}

function inspectDocker(files: string[]): DockerFacts | undefined {
  const dockerfiles = files.filter((file) => path.basename(file).startsWith("Dockerfile")).sort();
  const composeFiles = files
    .filter((file) => /(^|\/)(compose|docker-compose)\.ya?ml$/.test(file))
    .sort();

  if (dockerfiles.length === 0 && composeFiles.length === 0) {
    return undefined;
  }

  return { dockerfiles, composeFiles };
}

async function inspectReadme(root: string, fileSet: Set<string>): Promise<ReadmeFacts | undefined> {
  const readmePath = [...fileSet].find((file) => /^readme(\.[a-z0-9]+)?$/i.test(file));
  if (!readmePath) {
    return undefined;
  }

  const content = await readText(path.join(root, readmePath));
  const lines = content.split(/\r?\n/);
  const title = lines.find((line) => /^#\s+\S/.test(line))?.replace(/^#\s+/, "").trim();
  const description = lines
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("![")) ;

  return { path: readmePath, title, description };
}

function inspectTestConfigs(files: string[]): string[] {
  return files
    .filter((file) => {
      const basename = path.basename(file);
      return TEST_CONFIG_CANDIDATES.includes(file) || TEST_CONFIG_CANDIDATES.includes(basename);
    })
    .sort();
}

function inspectGitHubActions(files: string[]): string[] {
  return files.filter((file) => file.startsWith(".github/workflows/") && /\.ya?ml$/.test(file)).sort();
}

async function inspectDirectories(root: string): Promise<DirectoryFacts[]> {
  const directories: DirectoryFacts[] = [];

  for (const [relativePath, purpose] of DIRECTORY_PURPOSES) {
    if (await isDirectory(path.join(root, relativePath))) {
      directories.push({ path: relativePath, purpose });
    }
  }

  for (const workspaceRoot of ["apps", "packages"]) {
    const entries = await safeReaddir(path.join(root, workspaceRoot));
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        directories.push({
          path: `${workspaceRoot}/${entry.name}`,
          purpose: workspaceRoot === "apps" ? "workspace application" : "workspace package"
        });
      }
    }
  }

  return directories.sort((a, b) => a.path.localeCompare(b.path));
}

function detectPackageManager(
  packageJson: Record<string, unknown> | undefined,
  fileSet: Set<string>
): PackageManagerFacts | undefined {
  const declared = typeof packageJson?.packageManager === "string" ? packageJson.packageManager : undefined;
  if (declared) {
    const at = declared.lastIndexOf("@");
    if (at > 0) {
      const name = declared.slice(0, at);
      if (isPackageManagerName(name)) {
        return { name, version: declared.slice(at + 1), source: "package.json packageManager" };
      }
    }
  }

  if (fileSet.has("pnpm-lock.yaml")) {
    return { name: "pnpm", source: "pnpm-lock.yaml" };
  }
  if (fileSet.has("yarn.lock")) {
    return { name: "yarn", source: "yarn.lock" };
  }
  if (fileSet.has("bun.lockb") || fileSet.has("bun.lock")) {
    return { name: "bun", source: "bun lockfile" };
  }
  if (fileSet.has("package-lock.json")) {
    return { name: "npm", source: "package-lock.json" };
  }
  return { name: "npm", source: "package.json default" };
}

function detectPythonManager(fileSet: Set<string>): PythonFacts["manager"] {
  if (fileSet.has("uv.lock")) {
    return "uv";
  }
  if (fileSet.has("poetry.lock")) {
    return "poetry";
  }
  if (fileSet.has("pdm.lock")) {
    return "pdm";
  }
  return "pip";
}

function detectLanguages(
  files: string[],
  facts: {
    packageJson?: PackageJsonFacts;
    python?: PythonFacts;
    go?: GoFacts;
    rust?: RustFacts;
  }
): string[] {
  const languages = new Set<string>();
  if (facts.packageJson) {
    languages.add("JavaScript");
  }
  if (files.some((file) => /\.(ts|tsx|mts|cts)$/.test(file)) || files.includes("tsconfig.json")) {
    languages.add("TypeScript");
  }
  if (files.some((file) => /\.(jsx|tsx)$/.test(file))) {
    languages.add("React JSX/TSX");
  }
  if (facts.python || files.some((file) => file.endsWith(".py"))) {
    languages.add("Python");
  }
  if (facts.go || files.some((file) => file.endsWith(".go"))) {
    languages.add("Go");
  }
  if (facts.rust || files.some((file) => file.endsWith(".rs"))) {
    languages.add("Rust");
  }
  if (files.some((file) => /\.(ya?ml)$/.test(file))) {
    languages.add("YAML");
  }
  if (files.some((file) => /(^|\/)Dockerfile/.test(file))) {
    languages.add("Dockerfile");
  }
  return [...languages].sort();
}

function detectFrameworks(dependencies: string[], files: string[]): string[] {
  const dependencySet = new Set(dependencies);
  const frameworks = new Set<string>();
  const dependencyHints: Array<[string, string]> = [
    ["@angular/core", "Angular"],
    ["@nestjs/core", "NestJS"],
    ["@sveltejs/kit", "SvelteKit"],
    ["@vue/runtime-core", "Vue"],
    ["astro", "Astro"],
    ["cypress", "Cypress"],
    ["eslint", "ESLint"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["jest", "Jest"],
    ["next", "Next.js"],
    ["playwright", "Playwright"],
    ["prettier", "Prettier"],
    ["react", "React"],
    ["typescript", "TypeScript"],
    ["vite", "Vite"],
    ["vitest", "Vitest"],
    ["vue", "Vue"]
  ];

  for (const [dependency, label] of dependencyHints) {
    if (dependencySet.has(dependency)) {
      frameworks.add(label);
    }
  }

  if (files.some((file) => file.startsWith(".github/workflows/"))) {
    frameworks.add("GitHub Actions");
  }

  return [...frameworks].sort();
}

async function collectFiles(root: string, maxDepth = 4, maxFiles = 2000): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, depth: number): Promise<void> {
    if (results.length >= maxFiles || depth > maxDepth) {
      return;
    }

    const entries = await safeReaddir(current);
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }

      const absolutePath = path.join(current, entry.name);
      const relativePath = toPosix(path.relative(root, absolutePath));
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(absolutePath, depth + 1);
        }
        continue;
      }

      if (entry.isFile()) {
        results.push(relativePath);
      }
    }
  }

  await walk(root, 0);
  return results.sort();
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function safeReaddir(filePath: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(filePath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function findTomlString(content: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escaped}\\s*=\\s*["']([^"']+)["']`, "m").exec(content);
  return match?.[1];
}

function isPackageManagerName(value: string): value is PackageManagerFacts["name"] {
  return value === "npm" || value === "pnpm" || value === "yarn" || value === "bun";
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
