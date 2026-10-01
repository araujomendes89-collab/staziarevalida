/**
 * Minimal structured security audit logging.
 * Never logs tokens, credentials, authorization headers,
 * or sensitive medical/user payloads.
 * Logs auth failures and privileged operations only.
 */

export interface AuthAuditEvent {
  timestamp: string;
  event: string;            // e.g. "auth_failure", "privileged_op"
  uid?: string;              // non-sensitive identifier only
  reason?: string;           // category of failure (no payload details)
  roleChecked?: boolean;     // whether role check passed
}

export function logAuthAudit(event: AuthAuditEvent): void {
  // Structured console output; never includes tokens/headers/userData
  console.log(
    JSON.stringify({
      audit: true,
      service: "auth",
      ...event,
    })
  );
}
