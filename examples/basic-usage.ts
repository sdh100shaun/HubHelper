/**
 * Example: Basic Usage of GitHub Security Analysis Tools
 *
 * This example demonstrates how to use the analysis tools programmatically
 * rather than through the CLI.
 */

import { AIAnalyzer } from '../src/analyzers/ai-analyzer.js';
import { SecurityAnalyzer } from '../src/analyzers/security-analyzer.js';
import { ConsoleReporter } from '../src/reporters/console-reporter.js';
import { HTMLReporter } from '../src/reporters/html-reporter.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';

async function main() {
  // Configuration
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
  const GITHUB_ORG = process.env.GITHUB_ORG || '';
  const DAYS_BACK = 30;

  if (!GITHUB_TOKEN || !GITHUB_ORG) {
    console.error('Please set GITHUB_TOKEN and GITHUB_ORG environment variables');
    process.exit(1);
  }

  console.log(`Analyzing organization: ${GITHUB_ORG}`);

  // Step 1: Fetch data from GitHub
  const fetcher = new GitHubFetcher(GITHUB_TOKEN, GITHUB_ORG);

  console.log('Fetching repositories...');
  const repositories = await fetcher.getRepositories();
  console.log(`Found ${repositories.length} repositories`);

  console.log('Fetching pull requests...');
  const pullRequests = await fetcher.getRecentPullRequests(DAYS_BACK);
  console.log(`Found ${pullRequests.length} pull requests from last ${DAYS_BACK} days`);

  // Step 2: Analyze security issues
  console.log('\nAnalyzing security issues...');
  const analyzer = new SecurityAnalyzer();
  const analysisResult = analyzer.generateAnalysisResult(repositories, pullRequests);

  // Step 3: Generate AI-powered insights
  console.log('Generating AI insights...');
  const aiAnalyzer = new AIAnalyzer();
  const aiInsights = await aiAnalyzer.generateInsights(analysisResult);
  const patterns = await aiAnalyzer.analyzePatterns(analysisResult.issues);
  const recommendations = await aiAnalyzer.generateRecommendations(analysisResult.issues);

  // Add AI recommendations
  analysisResult.recommendations.push(...recommendations);

  // Step 4: Display results
  const consoleReporter = new ConsoleReporter();
  consoleReporter.printAnalysisResult(analysisResult, aiInsights);

  // Step 5: Save HTML report
  const htmlReporter = new HTMLReporter();
  htmlReporter.saveToFile(analysisResult, 'security-report.html', aiInsights);
  console.log('\n✅ HTML report saved to: security-report.html');

  // Step 6: Display patterns and risk assessment
  console.log('\n📊 Detected Patterns:');
  for (const p of patterns.patterns) {
    console.log(`  - ${p}`);
  }

  console.log('\n📈 Trends:');
  for (const t of patterns.trends) {
    console.log(`  - ${t}`);
  }

  console.log(`\n🎯 Risk Assessment: ${patterns.risk_assessment}`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
