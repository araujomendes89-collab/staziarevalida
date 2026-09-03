import { generatorParameters, FSRS, fsrs } from "ts-fsrs";

/**
 * FSRS Configuration for StaziaMed Revalida
 * Target Retention: 90% (0.90) - Standard retention level for medical licensing exam prep
 * Day-level scheduling (enable_short_term: false)
 */
export const FSRS_CONFIG = {
  request_retention: 0.9,
  maximum_interval: 36500, // 100 years
  enable_short_term: false, // Day-level scheduling
  schedulerVersion: "FSRS_V1" as const,
};

export const createFSRSInstance = (): FSRS => {
  const params = generatorParameters({
    request_retention: FSRS_CONFIG.request_retention,
    maximum_interval: FSRS_CONFIG.maximum_interval,
    enable_short_term: FSRS_CONFIG.enable_short_term,
  });
  return fsrs(params);
};

export const defaultFSRS = createFSRSInstance();
