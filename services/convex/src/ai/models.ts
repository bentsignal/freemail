import type { ActionCtx } from "../_generated/server";
import type { ClassificationSignal } from "../classification/constants";
import type { NormalizedMail } from "../classification/normalize";
import {
  reserveEmbeddingCostUsd,
  reserveResponseCostUsd,
} from "../aiUsage/pricing";
import {
  DEFAULT_CLASSIFICATION_MODEL,
  DEFAULT_CLEAN_VIEW_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from "../classification/constants";
import {
  classificationModelOverride,
  cleanViewModelOverride,
  embeddingModelOverride,
} from "./env";
import { gatewayModelId, postAiGateway } from "./gateway";
import {
  classificationRequest as buildClassificationRequest,
  cleanViewRequest as buildCleanViewRequest,
  parseClassification,
  parseCleanView,
} from "./payloads";

export { parseClassification, parseCleanView } from "./payloads";
export { AiDailyLimitError } from "./gateway";

const CLASSIFICATION_MAX_OUTPUT_TOKENS = 1_000;
const CLEAN_VIEW_MAX_OUTPUT_TOKENS = 2_000;

export function configuredClassificationModel() {
  return classificationModelOverride() ?? DEFAULT_CLASSIFICATION_MODEL;
}

export function configuredCleanViewModel() {
  return cleanViewModelOverride() ?? DEFAULT_CLEAN_VIEW_MODEL;
}

export function configuredEmbeddingModel() {
  return embeddingModelOverride() ?? DEFAULT_EMBEDDING_MODEL;
}

export async function classifyWithModel(args: {
  ctx: ActionCtx;
  ownerId: string;
  mail: NormalizedMail;
  signals: ClassificationSignal[];
  jobKey: string;
}) {
  const request = classificationRequest(args.mail, args.signals);
  const data = await postAiGateway({
    ctx: args.ctx,
    ownerId: args.ownerId,
    path: "/v1/responses",
    body: request,
    requestKey: args.jobKey,
    kind: "classification",
    model: configuredClassificationModel(),
    reservedCostUsd: reserveResponseCostUsd({
      model: configuredClassificationModel(),
      inputCharacters: utf8ByteLength(JSON.stringify(request)),
      maxOutputTokens: CLASSIFICATION_MAX_OUTPUT_TOKENS,
    }),
  });
  return parseClassification(extractOutputText(data));
}

export async function generateCleanView(args: {
  ctx: ActionCtx;
  ownerId: string;
  mail: NormalizedMail;
  jobKey: string;
}) {
  const request = cleanViewRequest(args.mail);
  const data = await postAiGateway({
    ctx: args.ctx,
    ownerId: args.ownerId,
    path: "/v1/responses",
    body: request,
    requestKey: args.jobKey,
    kind: "clean_view",
    model: configuredCleanViewModel(),
    reservedCostUsd: reserveResponseCostUsd({
      model: configuredCleanViewModel(),
      inputCharacters: utf8ByteLength(JSON.stringify(request)),
      maxOutputTokens: CLEAN_VIEW_MAX_OUTPUT_TOKENS,
    }),
  });
  return parseCleanView(extractOutputText(data));
}

export async function createEmbedding(args: {
  ctx: ActionCtx;
  ownerId: string;
  input: string;
  jobKey: string;
}) {
  const model = configuredEmbeddingModel();
  const body = {
    model: gatewayModelId(model),
    input: args.input,
    dimensions: EMBEDDING_DIMENSIONS,
    encoding_format: "float",
  };
  const data = await postAiGateway({
    ctx: args.ctx,
    ownerId: args.ownerId,
    path: "/v1/embeddings",
    body,
    requestKey: args.jobKey,
    kind: "embedding",
    model,
    reservedCostUsd: reserveEmbeddingCostUsd(model, utf8ByteLength(args.input)),
  });
  return extractEmbedding(data);
}

export function classificationRequest(
  mail: NormalizedMail,
  signals: ClassificationSignal[],
) {
  return buildClassificationRequest({
    mail,
    signals,
    model: gatewayModelId(configuredClassificationModel()),
    maxOutputTokens: CLASSIFICATION_MAX_OUTPUT_TOKENS,
  });
}

export function cleanViewRequest(mail: NormalizedMail) {
  return buildCleanViewRequest({
    mail,
    model: gatewayModelId(configuredCleanViewModel()),
    maxOutputTokens: CLEAN_VIEW_MAX_OUTPUT_TOKENS,
  });
}

function extractOutputText(data: unknown) {
  if (!isRecord(data) || !isUnknownArray(data.output)) {
    throw new Error("AI response did not include output");
  }
  for (const output of data.output) {
    if (!isRecord(output) || !isUnknownArray(output.content)) continue;
    for (const content of output.content) {
      if (isRecord(content) && content.type === "output_text") {
        if (typeof content.text === "string") return content.text;
      }
    }
  }
  throw new Error("AI response did not include structured output text");
}

function extractEmbedding(data: unknown) {
  if (!isRecord(data) || !isUnknownArray(data.data)) {
    throw new Error("AI response did not include embedding data");
  }
  const first = data.data[0];
  if (!isRecord(first) || !isUnknownArray(first.embedding)) {
    throw new Error("AI response did not include an embedding vector");
  }
  const vector = first.embedding.filter(isFiniteNumber);
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must contain ${EMBEDDING_DIMENSIONS} values`);
  }
  return vector;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
