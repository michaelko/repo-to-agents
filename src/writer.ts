import { promises as fs } from "node:fs";
import path from "node:path";
import type { CheckReport, FileStatus, GeneratedOutput, WriteReport } from "./types";
import { GENERATED_MARKER } from "./types";

export interface WriteOptions {
  force?: boolean;
}

interface ExistingState {
  output: GeneratedOutput;
  existing?: string;
}

export function hasGeneratedMarker(content: string): boolean {
  return content.includes(GENERATED_MARKER);
}

export async function checkOutputs(outputs: readonly GeneratedOutput[]): Promise<CheckReport> {
  const report: CheckReport = { missing: [], stale: [], unchanged: [] };

  for (const output of outputs) {
    const existing = await readOptional(output.path);
    if (existing === undefined) {
      report.missing.push(fileStatus(output.path));
    } else if (existing !== output.content) {
      report.stale.push(fileStatus(output.path));
    } else {
      report.unchanged.push(fileStatus(output.path));
    }
  }

  return report;
}

export async function writeOutputs(
  outputs: readonly GeneratedOutput[],
  options: WriteOptions = {}
): Promise<WriteReport> {
  const states: ExistingState[] = [];
  const report: WriteReport = { written: [], unchanged: [], protected: [] };

  for (const output of outputs) {
    const existing = await readOptional(output.path);
    states.push({ output, existing });

    if (existing === output.content) {
      report.unchanged.push(fileStatus(output.path));
    } else if (existing !== undefined && !options.force && !hasGeneratedMarker(existing)) {
      report.protected.push(fileStatus(output.path));
    }
  }

  if (report.protected.length > 0) {
    return report;
  }

  for (const state of states) {
    if (state.existing === state.output.content) {
      continue;
    }
    await fs.mkdir(path.dirname(state.output.path), { recursive: true });
    await fs.writeFile(state.output.path, state.output.content, "utf8");
    report.written.push(fileStatus(state.output.path));
  }

  return report;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function fileStatus(filePath: string): FileStatus {
  return { path: filePath };
}
