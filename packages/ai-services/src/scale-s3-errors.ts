/**
 * NF-WF-050C: typed refusals for the optional S3 SCALE proposal assistance.
 *
 * Follows the PolicyError/PublicationError precedent: a typed error carrying
 * the machine-readable code, mapped by the platform error handler (checked
 * BEFORE the generic ConflictError branch). Lives in a leaf module with no
 * service imports so scale-s3.ts can throw it without import cycles.
 */
export type ScaleS3ErrorCode =
  // 409: per-novel S3 enablement is off (the default). Never a model call.
  | "S3_DISABLED"
  // 409: no SCALE policy is configured for the novel; extraction serves
  // SCALE assessment and there is nothing to assess against.
  | "S3_NOT_CONFIGURED"
  // 422: the model returned output that failed the fail-closed validation
  // (malformed JSON, unknown scale/relevance, quote/span mismatch). The
  // Generation row still records the failed request.
  | "S3_INVALID_PROPOSAL";

export class ScaleS3Error extends Error {
  readonly code: ScaleS3ErrorCode;
  readonly statusCode: 409 | 422;
  constructor(code: ScaleS3ErrorCode, message: string) {
    super(message);
    this.name = "ScaleS3Error";
    this.code = code;
    this.statusCode = code === "S3_INVALID_PROPOSAL" ? 422 : 409;
  }
}
