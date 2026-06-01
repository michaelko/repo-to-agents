export { buildOutputs, generateAgents, generateTargetMarkdown, outputPathForTarget } from "./generator";
export { inspectRepository } from "./inspector";
export { checkOutputs, hasGeneratedMarker, writeOutputs } from "./writer";
export { GENERATED_MARKER, SUPPORTED_TARGETS } from "./types";
export type {
  CheckReport,
  GeneratedOutput,
  RepoFacts,
  Target,
  WriteReport
} from "./types";
