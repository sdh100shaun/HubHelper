/**
 * HTML Sanitizer Utility
 * Prevents XSS attacks by escaping HTML special characters
 */

import type { SecurityIssue } from '../types/index.js';

/**
 * Escapes HTML special characters to prevent XSS
 * @param unsafe - Potentially unsafe string from user input or API
 * @returns Safely escaped HTML string
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes URLs to prevent javascript: and data: URIs
 * @param url - URL to sanitize
 * @returns Safe URL or empty string if malicious
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const urlLower = url.trim().toLowerCase();

  // Block javascript: and data: URIs
  if (urlLower.startsWith('javascript:') || urlLower.startsWith('data:')) {
    return '';
  }

  // Only allow http:// and https:// URLs
  if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
    return '';
  }

  // Return the URL as-is (will be escaped by browser when used in href attribute)
  return url.trim();
}

/**
 * Sanitizes an entire SecurityIssue object for HTML output
 */
export function sanitizeSecurityIssue(issue: SecurityIssue): SecurityIssue {
  return {
    ...issue,
    repository: escapeHtml(issue.repository),
    description: escapeHtml(issue.description),
    details: {
      ...issue.details,
      title: issue.details.title ? escapeHtml(issue.details.title) : undefined,
      url: issue.details.url ? sanitizeUrl(issue.details.url) : undefined,
      repo_name: issue.details.repo_name ? escapeHtml(issue.details.repo_name) : undefined,
      workflow_name: issue.details.workflow_name
        ? escapeHtml(issue.details.workflow_name)
        : undefined,
      author: issue.details.author ? escapeHtml(issue.details.author) : undefined,
      merged_by: issue.details.merged_by ? escapeHtml(issue.details.merged_by) : undefined,
      workflow_path: issue.details.workflow_path
        ? escapeHtml(issue.details.workflow_path)
        : undefined,
      workflow_url: issue.details.workflow_url
        ? sanitizeUrl(issue.details.workflow_url)
        : undefined,
    },
  };
}
