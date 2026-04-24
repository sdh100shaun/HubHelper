import { writeFileSync } from 'node:fs';
import type { ListReport } from '../types/index.js';

/**
 * CSVReporter
 *
 * Exports repository list reports to CSV format
 */
export class CSVReporter {
  /**
   * Save list report to CSV file
   */
  saveToFile(report: ListReport, filename: string): void {
    const csv = this.generateCSV(report);
    writeFileSync(filename, csv, 'utf-8');
  }

  /**
   * Generate CSV string from report
   */
  generateCSV(report: ListReport): string {
    const lines: string[] = [];

    // Header
    lines.push('Repository,URL,Actions Enabled,Security Enabled,Security Issues,Last Activity');

    // Data rows
    for (const repo of report.repositories) {
      lines.push(
        [
          this.escapeCsvValue(repo.full_name),
          this.escapeCsvValue(repo.url),
          repo.actions_enabled ? 'Yes' : 'No',
          repo.security_enabled ? 'Yes' : 'No',
          repo.security_issues.toString(),
          this.escapeCsvValue(repo.last_activity),
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  /**
   * Escape CSV values (handle quotes and commas)
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
