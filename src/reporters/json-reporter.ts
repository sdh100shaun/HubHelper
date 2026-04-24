import { writeFileSync } from 'node:fs';
import type { AnalysisResult, ListReport } from '../types/index.js';

export class JSONReporter {
  saveToFile(result: AnalysisResult | ListReport, filename: string): void {
    const output = {
      generated_at: new Date().toISOString(),
      ...result,
    };

    writeFileSync(filename, JSON.stringify(output, null, 2), 'utf-8');
  }

  print(result: AnalysisResult | ListReport): void {
    console.log(JSON.stringify(result, null, 2));
  }
}
