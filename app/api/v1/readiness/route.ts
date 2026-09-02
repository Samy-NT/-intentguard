/**
 * /api/v1/readiness
 * Deployment readiness report for environment and database prerequisites.
 */
export const runtime = "nodejs";

export { GET } from "@/app/api/readiness/route";
