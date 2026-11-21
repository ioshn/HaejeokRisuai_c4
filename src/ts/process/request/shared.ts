import { LLMFlags, LLMFormat, type LLMModel } from "src/ts/model/types";
import { presetStore } from "src/ts/stores/domain/presetStore.svelte";
import { settingsStore } from "src/ts/stores/domain/settingsStore.svelte";

import { parseAdditionalParamJsonValue } from "./additionalParams";

export type LLMParameter =
  | "temperature"
  | "top_k"
  | "repetition_penalty"
  | "min_p"
  | "top_a"
  | "top_p"
  | "frequency_penalty"
  | "presence_penalty"
  | "reasoning_effort"
  | "reasoning_effort_min_medium"
  | "reasoning_effort_none"
  | "reasoning_effort_xhigh"
  | "thinking_tokens"
  | "verbosity";

export type ModelModeExtended =
  "model" | "submodel" | "memory" | "emotion" | "otherAx" | "translate";

const REASONING_CAPABILITY_PARAMETERS_SET = new Set<LLMParameter>([
  "reasoning_effort_min_medium",
  "reasoning_effort_none",
  "reasoning_effort_xhigh",
]);

export function isReasoningCapabilityParameter(
  parameter: LLMParameter,
): boolean {
  return REASONING_CAPABILITY_PARAMETERS_SET.has(parameter);
}

export function setObjectValue<T>(obj: T, key: string, value: any): T {
  if (!key.includes(".")) {
    (obj as any)[key] = value;
    return obj;
  }

  const splitKey = key.split(".");
  let cur: any = obj;
  for (let i = 0; i < splitKey.length - 1; i++) {
    const k = splitKey[i];
    if (!cur[k] || typeof cur[k] !== "object") {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[splitKey[splitKey.length - 1]] = value;
  return obj;
}

function parseAdditionalParamLines(params?: string): [string, string][] {
  const additionalParams: [string, string][] = [];
  for (const line of (params ?? "").split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      additionalParams.push([line.slice(0, eqIdx), line.slice(eqIdx + 1)]);
    }
  }
  return additionalParams;
}

export interface ModelReasoningEffortMeta {
  path: string;
  options: string[];
}

export function resolveModelReasoningEffortMeta(
  modelInfo?: LLMModel | null,
): ModelReasoningEffortMeta | null {
  if (!modelInfo) return null;

  if (
    modelInfo.reasoningEffortPath &&
    modelInfo.reasoningEffortOptions &&
    modelInfo.reasoningEffortOptions.length > 0
  ) {
    const path =
      modelInfo.format === LLMFormat.OpenAIResponseAPI
        ? "reasoning.effort"
        : modelInfo.reasoningEffortPath;
    return {
      path,
      options: modelInfo.reasoningEffortOptions,
    };
  }

  const params = modelInfo.parameters ?? [];
  const flags = modelInfo.flags ?? [];

  if (
    modelInfo.format === LLMFormat.Anthropic ||
    modelInfo.format === LLMFormat.AWSBedrockClaude
  ) {
    if (flags.includes(LLMFlags.claudeAdaptiveThinking)) {
      const options = flags.includes(LLMFlags.claudeXHighEffort)
        ? ["low", "medium", "high", "xhigh", "max"]
        : ["low", "medium", "high", "max"];
      return {
        path: modelInfo.reasoningEffortPath ?? "output_config.effort",
        options:
          modelInfo.reasoningEffortOptions &&
          modelInfo.reasoningEffortOptions.length > 0
            ? modelInfo.reasoningEffortOptions
            : options,
      };
    }
    return null;
  }

  if (flags.includes(LLMFlags.deepSeekThinkingToggle)) {
    return {
      path: modelInfo.reasoningEffortPath ?? "thinking.reasoning_effort",
      options:
        modelInfo.reasoningEffortOptions &&
        modelInfo.reasoningEffortOptions.length > 0
          ? modelInfo.reasoningEffortOptions
          : ["high", "max"],
    };
  }

  const hasReasoningParam =
    params.includes("reasoning_effort") ||
    params.includes("reasoning_effort_min_medium") ||
    params.includes("reasoning_effort_none") ||
    params.includes("reasoning_effort_xhigh");

  if (
    modelInfo.format === LLMFormat.GoogleCloud ||
    modelInfo.format === LLMFormat.VertexAIGemini
  ) {
    if (!hasReasoningParam) return null;
    const options: string[] = [];
    if (!flags.includes(LLMFlags.geminiThinkingNoMinimal)) {
      options.push("minimal");
    }
    options.push("low", "medium", "high");
    if (params.includes("reasoning_effort_xhigh")) {
      options.push("xhigh");
    }
    return {
      path: modelInfo.reasoningEffortPath ?? "thinkingConfig.thinkingLevel",
      options:
        modelInfo.reasoningEffortOptions &&
        modelInfo.reasoningEffortOptions.length > 0
          ? modelInfo.reasoningEffortOptions
          : options,
    };
  }

  if (hasReasoningParam) {
    const options: string[] = [];
    if (params.includes("reasoning_effort_none")) {
      options.push("none");
    } else if (!params.includes("reasoning_effort_min_medium")) {
      options.push("minimal");
    }
    if (!params.includes("reasoning_effort_min_medium")) {
      options.push("low");
    }
    options.push("medium", "high");
    if (params.includes("reasoning_effort_xhigh")) {
      options.push("xhigh");
    }
    const defaultPath =
      modelInfo.format === LLMFormat.OpenAIResponseAPI
        ? "reasoning.effort"
        : "reasoning_effort";
    return {
      path: modelInfo.reasoningEffortPath ?? defaultPath,
      options:
        modelInfo.reasoningEffortOptions &&
        modelInfo.reasoningEffortOptions.length > 0
          ? modelInfo.reasoningEffortOptions
          : options,
    };
  }

  return null;
}

export function getModelReasoningEffort(aiModel?: string): string | undefined {
  if (!aiModel) return undefined;
  const val = settingsStore.state.modelReasoningEffort?.[aiModel]?.trim();
  return val || undefined;
}

export function applyModelReasoningEffort<T extends Record<string, any>>(
  body: T,
  aiModel: string | undefined,
  modelInfo: LLMModel | undefined,
  pathOverride?: string,
): T {
  const effort = getModelReasoningEffort(aiModel);
  if (!effort || !modelInfo) {
    return body;
  }
  const meta = resolveModelReasoningEffortMeta(modelInfo);
  const path = pathOverride ?? meta?.path;
  if (!path) {
    return body;
  }
  return setObjectValue(body, path, effort);
}

// Concatenate shared, preset-bound, and persistent model-dependent parameters.
// Per-model parameters come last so they win over preset and shared ones.
export function getAdditionalParameters(aiModel?: string): [string, string][] {
  if (!aiModel) {
    return [];
  }
  return [
    ...getSharedAdditionalParameters(aiModel),
    ...parseAdditionalParamLines(presetStore.state.presetAdditionalParams),
    ...parseAdditionalParamLines(
      settingsStore.state.modelAdditionalParams?.[aiModel],
    ),
  ];
}

function getSharedAdditionalParameters(aiModel: string): [string, string][] {
  const db = settingsStore.state;

  if (aiModel === "reverse_proxy") {
    return [...(db.additionalParams ?? [])];
  }

  if (!aiModel.startsWith("xcustom:::")) {
    return db.applyAdditionalParamsToAll
      ? [...(db.additionalParams ?? [])]
      : [];
  }

  const found = db.customModels.find((model) => model.id === aiModel);
  return parseAdditionalParamLines(found?.params);
}

export function applyAdditionalParameters<T extends Record<string, any>>(
  body: T,
  headers: Record<string, string>,
  additionalParams: [string, string][],
): T {
  for (const [rawKey, rawValue] of additionalParams) {
    let key = rawKey;
    let value = rawValue;

    if (!key || !value) {
      continue;
    }

    if (value === "{{none}}") {
      if (key.startsWith("header::")) {
        delete headers[key.replace("header::", "")];
      } else {
        delete body[key];
      }
      continue;
    }

    if (key.startsWith("header::")) {
      headers[key.replace("header::", "")] = value;
      continue;
    }

    if (value.startsWith("json::")) {
      const parsedValue = parseAdditionalParamJsonValue(
        value.replace("json::", ""),
      );
      if (parsedValue !== undefined) {
        body = setObjectValue(body, key, parsedValue);
      }
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      body = setObjectValue(body, key, value.slice(1, -1));
      continue;
    }

    if (value === "true" || value === "false") {
      body = setObjectValue(body, key, value === "true");
      continue;
    }

    if (value === "null") {
      body = setObjectValue(body, key, null);
      continue;
    }

    const num = Number(value);
    body = setObjectValue(body, key, isNaN(num) ? value : num);
  }

  return body;
}

export function applyParameters(
  data: Record<string, any>,
  parameters: LLMParameter[],
  rename: Partial<Record<LLMParameter, string>>,
  modelMode: ModelModeExtended,
  arg: {
    ignoreTopKIfZero?: boolean;
    modelId: string;
  },
): Record<string, any> {
  const db = settingsStore.state;
  const reasoningDisabledEffort = parameters.includes("reasoning_effort_none")
    ? "none"
    : "minimal";
  const reasoningMinEffort = parameters.includes("reasoning_effort_min_medium")
    ? "medium"
    : "low";
  const supportsXHighReasoning = parameters.includes("reasoning_effort_xhigh");

  function getEffort(
    effort: number,
    disabledEffort: "minimal" | "none" = "minimal",
    supportsXHigh = false,
    minEffort: "low" | "medium" = "low",
  ) {
    switch (effort) {
      case -1: {
        return disabledEffort;
      }
      case 0: {
        return minEffort;
      }
      case 1: {
        return "medium";
      }
      case 2: {
        return "high";
      }
      case 3: {
        return supportsXHigh ? "xhigh" : "high";
      }
      default: {
        return "medium";
      }
    }
  }

  function getVerbosity(verbosity: number) {
    return ["low", "medium", "high"][verbosity] ?? "medium";
  }

  if (
    presetStore.state.seperateParametersEnabled &&
    (modelMode !== "model" || db.seperateParametersByModel)
  ) {
    let sepParams = presetStore.state.seperateParameters[modelMode];
    if (db.seperateParametersByModel) {
      sepParams = presetStore.state.seperateParameters.overrides[arg.modelId];

      if (!sepParams) {
        throw new Error(
          `No seperate parameters found for model ${arg.modelId} in model mode ${modelMode}. Please set parameters for this model`,
        );
      }
    }
    if (modelMode === "submodel") {
      sepParams = presetStore.state.seperateParameters["otherAx"];
    }

    for (const parameter of parameters) {
      let value: number | string = 0;
      if (isReasoningCapabilityParameter(parameter)) {
        continue;
      }
      if (
        parameter === "top_k" &&
        arg.ignoreTopKIfZero &&
        sepParams[parameter] === 0
      ) {
        continue;
      }

      switch (parameter) {
        case "temperature": {
          value =
            sepParams.temperature === -1000
              ? -1000
              : sepParams.temperature / 100;
          break;
        }
        case "top_k": {
          value = sepParams.top_k;
          break;
        }
        case "repetition_penalty": {
          value = sepParams.repetition_penalty;
          break;
        }
        case "min_p": {
          value = sepParams.min_p;
          break;
        }
        case "top_a": {
          value = sepParams.top_a;
          break;
        }
        case "top_p": {
          value = sepParams.top_p;
          break;
        }
        case "thinking_tokens": {
          value = sepParams.thinking_tokens;
          break;
        }
        case "frequency_penalty": {
          value =
            sepParams.frequency_penalty === -1000
              ? -1000
              : sepParams.frequency_penalty / 100;
          break;
        }
        case "presence_penalty": {
          value =
            sepParams.presence_penalty === -1000
              ? -1000
              : sepParams.presence_penalty / 100;
          break;
        }
        case "reasoning_effort": {
          value = getEffort(
            sepParams.reasoning_effort,
            reasoningDisabledEffort,
            supportsXHighReasoning,
            reasoningMinEffort,
          );
          break;
        }
        case "verbosity": {
          value = getVerbosity(sepParams.verbosity);
          break;
        }
      }

      if (
        value === -1000 ||
        value === undefined ||
        value === null ||
        (typeof value === "number" && isNaN(value))
      ) {
        continue;
      }

      data = setObjectValue(data, rename[parameter] ?? parameter, value);
    }
    return data;
  }

  for (const parameter of parameters) {
    let value: number | string = 0;
    if (isReasoningCapabilityParameter(parameter)) {
      continue;
    }
    if (
      parameter === "top_k" &&
      arg.ignoreTopKIfZero &&
      presetStore.state.top_k === 0
    ) {
      continue;
    }
    switch (parameter) {
      case "temperature": {
        value =
          presetStore.state.temperature === -1000
            ? -1000
            : presetStore.state.temperature / 100;
        break;
      }
      case "top_k": {
        value = presetStore.state.top_k;
        break;
      }
      case "repetition_penalty": {
        value = presetStore.state.repetition_penalty;
        break;
      }
      case "min_p": {
        value = presetStore.state.min_p;
        break;
      }
      case "top_a": {
        value = presetStore.state.top_a;
        break;
      }
      case "top_p": {
        value = presetStore.state.top_p;
        break;
      }
      case "reasoning_effort": {
        value = getEffort(
          presetStore.state.reasonEffort,
          reasoningDisabledEffort,
          supportsXHighReasoning,
          reasoningMinEffort,
        );
        break;
      }
      case "verbosity": {
        value = getVerbosity(presetStore.state.verbosity);
        break;
      }
      case "frequency_penalty": {
        value =
          presetStore.state.frequencyPenalty === -1000
            ? -1000
            : presetStore.state.frequencyPenalty / 100;
        break;
      }
      case "presence_penalty": {
        value =
          presetStore.state.PresensePenalty === -1000
            ? -1000
            : presetStore.state.PresensePenalty / 100;
        break;
      }
      case "thinking_tokens": {
        value = presetStore.state.thinkingTokens;
        break;
      }
    }

    if (value === -1000) {
      continue;
    }

    data = setObjectValue(data, rename[parameter] ?? parameter, value);
  }
  return data;
}
