/**
 * Express Server PORT resolution and validation for Cloud Run runtime compatibility.
 * Fail-closed on invalid port definitions. Defaults to 3000 when unset.
 */
export function resolveServerPort(rawPort: string | undefined = process.env.PORT): number {
  if (rawPort === undefined || rawPort.trim() === "") {
    return 3000;
  }
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT configuration: "${rawPort}". PORT must be an integer between 1 and 65535.`);
  }
  return parsed;
}
