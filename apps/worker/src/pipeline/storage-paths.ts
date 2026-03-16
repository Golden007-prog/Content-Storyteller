/**
 * Storage path utilities for the worker pipeline.
 *
 * All generated assets follow the convention:
 *   {project_id}/{job_id}/{category}/{filename}
 *
 * When project_id is not available in the pipeline context,
 * 'default' is used as a fallback.
 */

/**
 * Extract the project_id from pipeline working data, falling back to 'default'.
 */
export function getProjectId(workingData: Record<string, unknown>): string {
  const projectId = workingData.projectId;
  if (typeof projectId === 'string' && projectId.trim().length > 0) {
    return projectId.trim();
  }
  return 'default';
}

/**
 * Build a storage path with the standard convention:
 *   {project_id}/{job_id}/{category}/{filename}
 */
export function buildStoragePath(
  projectId: string,
  jobId: string,
  category: string,
  filename: string,
): string {
  return `${projectId}/${jobId}/${category}/${filename}`;
}
