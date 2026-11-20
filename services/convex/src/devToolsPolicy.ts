/**
 * Deployments with Shawn's real mail: production, and the one it moved
 * from (docs/production-migration.md). Dev tools never run there, whatever
 * their env.
 */
export const REAL_MAIL_DEPLOYMENTS = [
  "colorful-ostrich-734",
  "dazzling-dog-633",
];
export const DEV_USER_EMAIL = "alex.rivera@example.com";

export function isDevToolsDeployment(config: {
  devTools: string | undefined;
  environment: string;
  cloudUrl: string;
  siteUrl: string;
}) {
  return (
    config.devTools === "true" &&
    config.environment === "development" &&
    !REAL_MAIL_DEPLOYMENTS.some(
      (name) => config.cloudUrl.includes(name) || config.siteUrl.includes(name),
    )
  );
}
