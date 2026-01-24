#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import ora from 'ora';
import { AIAnalyzer } from './analyzers/ai-analyzer.js';
import { SecurityAnalyzer } from './analyzers/security-analyzer.js';
import { ConsoleReporter } from './reporters/console-reporter.js';
import { HTMLReporter } from './reporters/html-reporter.js';
import { JSONReporter } from './reporters/json-reporter.js';
import { GitHubFetcher } from './services/github-fetcher.js';
import {
  validateDays,
  validateGitHubToken,
  validateOrganizationName,
} from './utils/input-validator.js';
import { validateFilePath } from './utils/path-validator.js';

// Load environment variables
config();

const program = new Command();

program
  .name('gh-tools')
  .description('AI-powered tools to visualize GitHub activity and flag security issues')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze organization activity and detect security issues')
  .option('-o, --org <organization>', 'GitHub organization name')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-d, --days <number>', 'Number of days to look back', '30')
  .option('--json <file>', 'Save results as JSON to file')
  .option('--html <file>', 'Save results as HTML to file')
  .option('--no-ai', 'Disable AI-powered insights')
  .action(async (options) => {
    const consoleReporter = new ConsoleReporter();

    try {
      // Get configuration
      const tokenInput = options.token || process.env.GITHUB_TOKEN;
      const orgInput = options.org || process.env.GITHUB_ORG;
      const daysInput = options.days;

      // Validate token
      const tokenValidation = validateGitHubToken(tokenInput);
      if (!tokenValidation.valid) {
        consoleReporter.printError(new Error(tokenValidation.error!));
        consoleReporter.printInfo('Set GITHUB_TOKEN environment variable or use --token flag');
        process.exit(1);
      }
      const token = tokenValidation.sanitized as string;

      // Validate organization
      const orgValidation = validateOrganizationName(orgInput);
      if (!orgValidation.valid) {
        consoleReporter.printError(new Error(orgValidation.error!));
        consoleReporter.printInfo('Set GITHUB_ORG environment variable or use --org flag');
        process.exit(1);
      }
      const org = orgValidation.sanitized as string;

      // Validate days
      const daysValidation = validateDays(daysInput);
      if (!daysValidation.valid) {
        consoleReporter.printError(new Error(daysValidation.error!));
        process.exit(1);
      }
      const days = daysValidation.sanitized as number;

      consoleReporter.printInfo(`Analyzing organization: ${org}`);
      consoleReporter.printInfo(`Looking back ${days} days\n`);

      // Fetch data
      const spinner = ora('Fetching repositories...').start();
      const fetcher = new GitHubFetcher(token, org);

      const repositories = await fetcher.getRepositories();
      spinner.succeed(`Fetched ${repositories.length} repositories`);

      spinner.start('Fetching pull requests...');
      const pullRequests = await fetcher.getRecentPullRequests(days);
      spinner.succeed(`Fetched ${pullRequests.length} pull requests`);

      // Analyze data
      spinner.start('Analyzing security issues...');
      const analyzer = new SecurityAnalyzer();
      const analysisResult = analyzer.generateAnalysisResult(repositories, pullRequests);
      spinner.succeed('Analysis complete');

      // Generate AI insights
      let aiInsights: string | undefined;
      if (options.ai !== false) {
        spinner.start('Generating AI-powered insights...');
        const aiAnalyzer = new AIAnalyzer();
        aiInsights = await aiAnalyzer.generateInsights(analysisResult);

        const patterns = await aiAnalyzer.analyzePatterns(analysisResult.issues);
        const recommendations = await aiAnalyzer.generateRecommendations(analysisResult.issues);

        // Add AI recommendations to result
        analysisResult.recommendations.push(...recommendations);

        spinner.succeed('AI insights generated');
      }

      // Display results
      consoleReporter.printAnalysisResult(analysisResult, aiInsights);

      // Save to files if requested
      if (options.json) {
        try {
          const safePath = validateFilePath(options.json, {
            allowedExtensions: ['.json'],
          });
          const jsonReporter = new JSONReporter();
          jsonReporter.saveToFile(analysisResult, safePath);
          consoleReporter.printSuccess(`Results saved to ${safePath}`);
        } catch (error) {
          if (error instanceof Error && error.message.includes('path traversal')) {
            consoleReporter.printError(
              new Error(
                `Security error: ${error.message}\nFor security, files can only be saved in the current directory or subdirectories.`
              )
            );
          } else {
            throw error;
          }
        }
      }

      if (options.html) {
        try {
          const safePath = validateFilePath(options.html, {
            allowedExtensions: ['.html'],
          });
          const htmlReporter = new HTMLReporter();
          htmlReporter.saveToFile(analysisResult, safePath, aiInsights);
          consoleReporter.printSuccess(`HTML report saved to ${safePath}`);
        } catch (error) {
          if (error instanceof Error && error.message.includes('path traversal')) {
            consoleReporter.printError(
              new Error(
                `Security error: ${error.message}\nFor security, files can only be saved in the current directory or subdirectories.`
              )
            );
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      consoleReporter.printError(error as Error);
      process.exit(1);
    }
  });

program
  .command('check-repo')
  .description('Check a specific repository for security issues')
  .argument('<owner/repo>', 'Repository in format owner/repo')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-d, --days <number>', 'Number of days to look back', '30')
  .action(async (repo, options) => {
    const consoleReporter = new ConsoleReporter();
    consoleReporter.printInfo(`Repository-specific analysis coming soon: ${repo}`);
  });

program
  .command('watch')
  .description('Watch organization activity in real-time (coming soon)')
  .option('-o, --org <organization>', 'GitHub organization name')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-i, --interval <minutes>', 'Check interval in minutes', '60')
  .action(async (options) => {
    const consoleReporter = new ConsoleReporter();
    consoleReporter.printInfo('Real-time monitoring coming soon!');
  });

program.parse();
