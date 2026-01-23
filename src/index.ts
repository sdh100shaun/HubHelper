#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import ora from 'ora';
import { GitHubFetcher } from './services/github-fetcher.js';
import { SecurityAnalyzer } from './analyzers/security-analyzer.js';
import { AIAnalyzer } from './analyzers/ai-analyzer.js';
import { ConsoleReporter } from './reporters/console-reporter.js';
import { JSONReporter } from './reporters/json-reporter.js';
import { HTMLReporter } from './reporters/html-reporter.js';

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
      const token = options.token || process.env.GITHUB_TOKEN;
      const org = options.org || process.env.GITHUB_ORG;
      const days = parseInt(options.days);

      if (!token) {
        consoleReporter.printError(new Error('GitHub token is required. Set GITHUB_TOKEN env var or use --token'));
        process.exit(1);
      }

      if (!org) {
        consoleReporter.printError(new Error('Organization name is required. Set GITHUB_ORG env var or use --org'));
        process.exit(1);
      }

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
        const jsonReporter = new JSONReporter();
        jsonReporter.saveToFile(analysisResult, options.json);
        consoleReporter.printSuccess(`Results saved to ${options.json}`);
      }

      if (options.html) {
        const htmlReporter = new HTMLReporter();
        htmlReporter.saveToFile(analysisResult, options.html, aiInsights);
        consoleReporter.printSuccess(`HTML report saved to ${options.html}`);
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
