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
      const days = Number.parseInt(options.days);

      if (!token) {
        consoleReporter.printError(
          new Error('GitHub token is required. Set GITHUB_TOKEN env var or use --token')
        );
        process.exit(1);
      }

      if (!org) {
        consoleReporter.printError(
          new Error('Organization name is required. Set GITHUB_ORG env var or use --org')
        );
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

// Repository List Commands
const listCmd = program
  .command('list')
  .description('Manage repository lists');

listCmd
  .command('create <name>')
  .description('Create a new repository list')
  .option('-d, --description <desc>', 'List description')
  .action(async (name, options) => {
    const { RepositoryListManager } = await import('./services/repository-list-manager.js');
    const manager = new RepositoryListManager();
    try {
      manager.createList(name, options.description || '');
      console.log(`✅ Created list '${name}'`);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

listCmd
  .command('add <list> <repository>')
  .description('Add repository to list (format: org/repo)')
  .action(async (list, repository) => {
    const { RepositoryListManager } = await import('./services/repository-list-manager.js');
    const manager = new RepositoryListManager();
    try {
      manager.addRepository(list, repository);
      console.log(`✅ Added ${repository} to list '${list}'`);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

listCmd
  .command('remove <list> <repository>')
  .description('Remove repository from list')
  .action(async (list, repository) => {
    const { RepositoryListManager } = await import('./services/repository-list-manager.js');
    const manager = new RepositoryListManager();
    try {
      manager.removeRepository(list, repository);
      console.log(`✅ Removed ${repository} from list '${list}'`);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

listCmd
  .command('show')
  .description('Show all repository lists')
  .action(async () => {
    const { RepositoryListManager } = await import('./services/repository-list-manager.js');
    const manager = new RepositoryListManager();
    try {
      const lists = manager.getAllLists();
      if (lists.length === 0) {
        console.log('No lists found. Create one with: gh-security list create <name>');
        return;
      }
      console.log('\n📋 Repository Lists:\n');
      for (const list of lists) {
        console.log(`  • ${list.name} (${list.repositories.length} repos)`);
        if (list.description) {
          console.log(`    ${list.description}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

listCmd
  .command('repos <list>')
  .description('Show repositories in a list')
  .action(async (list) => {
    const { RepositoryListManager } = await import('./services/repository-list-manager.js');
    const manager = new RepositoryListManager();
    try {
      const listData = manager.getList(list);
      console.log(`\n📦 Repositories in '${list}':\n`);
      if (listData.repositories.length === 0) {
        console.log('  (empty)');
      } else {
        for (const repo of listData.repositories) {
          console.log(`  • ${repo}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

listCmd
  .command('delete <name>')
  .description('Delete a repository list')
  .action(async (name) => {
    const { RepositoryListManager } = await import('./services/repository-list-manager.js');
    const manager = new RepositoryListManager();
    try {
      manager.deleteList(name);
      console.log(`✅ Deleted list '${name}'`);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Report Command
program
  .command('report <list>')
  .description('Generate report for a repository list')
  .option('-o, --org <organization>', 'GitHub organization name')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('--format <format>', 'Output format (console, json, csv, markdown)', 'console')
  .option('--output <file>', 'Output file path')
  .action(async (list, options) => {
    const consoleReporter = new ConsoleReporter();

    try {
      const token = options.token || process.env.GITHUB_TOKEN;
      const org = options.org || process.env.GITHUB_ORG;

      if (!token) {
        consoleReporter.printError(
          new Error('GitHub token is required. Set GITHUB_TOKEN env var or use --token')
        );
        process.exit(1);
      }

      if (!org) {
        consoleReporter.printError(
          new Error('Organization name is required. Set GITHUB_ORG env var or use --org')
        );
        process.exit(1);
      }

      const spinner = ora(`Generating report for list '${list}'...`).start();

      const { ListReportGenerator } = await import('./services/list-report-generator.js');
      const generator = new ListReportGenerator(token, org);

      const report = await generator.generateReport(list);
      spinner.succeed('Report generated');

      // Output based on format
      if (options.format === 'json') {
        const { JSONReporter } = await import('./reporters/json-reporter.js');
        const reporter = new JSONReporter();
        if (options.output) {
          reporter.saveToFile(report, options.output);
          console.log(`\n✅ Report saved to ${options.output}`);
        } else {
          console.log(JSON.stringify(report, null, 2));
        }
      } else if (options.format === 'csv') {
        const { CSVReporter } = await import('./reporters/csv-reporter.js');
        const reporter = new CSVReporter();
        if (options.output) {
          reporter.saveToFile(report, options.output);
          console.log(`\n✅ Report saved to ${options.output}`);
        } else {
          console.log(reporter.generateCSV(report));
        }
      } else if (options.format === 'markdown') {
        const { MarkdownReporter } = await import('./reporters/markdown-reporter.js');
        const reporter = new MarkdownReporter();
        if (options.output) {
          reporter.saveToFile(report, options.output);
          console.log(`\n✅ Report saved to ${options.output}`);
        } else {
          console.log(reporter.generateMarkdown(report));
        }
      } else {
        // Console output
        console.log(`\n${'='.repeat(80)}`);
        console.log(`  Repository List Report: ${list}`);
        console.log(`${'='.repeat(80)}\n`);
        console.log(`📊 Summary:`);
        console.log(`  • Total Repositories: ${report.summary.totalRepos}`);
        console.log(`  • Actions Enabled: ${report.summary.actionsEnabled}/${report.summary.totalRepos}`);
        console.log(`  • Security Enabled: ${report.summary.securityEnabled}/${report.summary.totalRepos}`);
        console.log(`  • Total Issues: ${report.summary.totalIssues}`);
        console.log(`  • Critical Issues: ${report.summary.criticalIssues}`);
        console.log(`  • High Issues: ${report.summary.highIssues}\n`);

        if (report.recommendations.length > 0) {
          console.log(`💡 Recommendations:`);
          for (const rec of report.recommendations) {
            console.log(`  ${rec}`);
          }
          console.log('');
        }
      }
    } catch (error) {
      consoleReporter.printError(error as Error);
      process.exit(1);
    }
  });

program.parse();
