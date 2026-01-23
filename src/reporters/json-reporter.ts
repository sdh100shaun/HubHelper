import { writeFileSync } from 'fs';
import { AnalysisResult } from '../types/index.js';

export class JSONReporter {
  saveToFile(result: AnalysisResult, filename: string): void {
    const output = {
      generated_at: new Date().toISOString(),
      ...result,
    };

    writeFileSync(filename, JSON.stringify(output, null, 2), 'utf-8');
  }

  print(result: AnalysisResult): void {
    console.log(JSON.stringify(result, null, 2));
  }
}
