/**
 * Safety Module for StratusCode Agent
 *
 * Configures and exports a SAGE safety manager with injection detection,
 * PII redaction, and content filtering for the agent pipeline.
 */

import {
  createSafetyManager,
  createInjectionGuard,
  createPIIGuard,
  createContentFilter,
  type SafetyContext,
  type AggregatedSafetyResult,
} from "@willebrew/sage-core/safety";

// Singleton — created once per Convex action runtime
let _manager: ReturnType<typeof createSafetyManager> | null = null;

export function getSafetyManager() {
  if (!_manager) {
    _manager = createSafetyManager({
      guards: [
        createInjectionGuard({ minSeverity: "medium" }),
        createPIIGuard({
          detectTypes: ["ssn", "credit_card", "api_key", "password", "bank_account"],
          redactTypes: ["ssn", "credit_card", "api_key", "password", "bank_account"],
          redactionStrategy: "mask",
          minConfidence: 0.8,
        }),
        createContentFilter({
          enableCategories: ["violence", "self_harm", "illegal_activity", "hate_speech"],
          minSeverity: "high",
        }),
      ],
      defaultAction: "warn",
      blockSeverity: "critical",
      sanitize: true,
      onViolation: (result, context) => {
        console.warn(
          `[safety] Violation for user=${context.userId} session=${context.sessionId}:`,
          result.issues.map((i) => `${i.type}:${i.severity}`).join(", ")
        );
      },
    });
  }
  return _manager;
}

/** Build SafetyContext from StratusCode session info */
export function buildSafetyContext(opts: {
  userId: string;
  sessionId: string;
  contentType: SafetyContext["contentType"];
  toolName?: string;
}): SafetyContext {
  return {
    userId: opts.userId,
    sessionId: opts.sessionId,
    contentType: opts.contentType,
    toolName: opts.toolName,
  };
}

/** Format safety issues for user-facing error message */
export function formatSafetyBlock(result: AggregatedSafetyResult): string {
  const issues = result.issues
    .filter((i) => i.severity === "critical" || i.severity === "high")
    .map((i) => `- ${i.message}`)
    .join("\n");
  return `Your message was blocked by safety filters:\n${issues}\n\nPlease rephrase and try again.`;
}
