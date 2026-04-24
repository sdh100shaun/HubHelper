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
import { WatchOrchestrator } from './services/watch-orchestrator.js';
import type { AnalysisResult } from './types/index.js';
import type { WatchConfig } from './types/watch.js';
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

        const _patterns = await aiAnalyzer.analyzePatterns(analysisResult.issues);
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
  .action(async (repo, _options) => {
    const consoleReporter = new ConsoleReporter();
    consoleReporter.printInfo(`Repository-specific analysis coming soon: ${repo}`);
  });

program
  .command('watch')
  .description('Continuously monitor organization for security issues')
  .option('-o, --org <organization>', 'GitHub organization name')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-i, --interval <minutes>', 'Check interval in minutes', '60')
  .option(
    '--min-severity <level>',
    'Minimum severity to alert (low|medium|high|critical)',
    'medium'
  )
  .option('-d, --days <number>', 'Lookback period for PRs', '7')
  .option('--once', 'Run single scan and exit (one-shot mode)')
  .option('--reset', 'Clear previous state before starting')
  .option('--no-ai', 'Disable AI-powered analysis')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    const consoleReporter = new ConsoleReporter();

    try {
      // Validate token
      const tokenInput = options.token || process.env.GITHUB_TOKEN;
      const tokenValidation = validateGitHubToken(tokenInput);
      if (!tokenValidation.valid) {
        consoleReporter.printError(new Error(tokenValidation.error!));
        consoleReporter.printInfo('Set GITHUB_TOKEN environment variable or use --token flag');
        process.exit(1);
      }
      const token = tokenValidation.sanitized as string;

      // Validate organization
      const orgInput = options.org || process.env.GITHUB_ORG;
      const orgValidation = validateOrganizationName(orgInput);
      if (!orgValidation.valid) {
        consoleReporter.printError(new Error(orgValidation.error!));
        consoleReporter.printInfo('Set GITHUB_ORG environment variable or use --org flag');
        process.exit(1);
      }
      const org = orgValidation.sanitized as string;

      // Validate interval
      const interval = Number.parseInt(options.interval, 10);
      if (Number.isNaN(interval) || interval < 1 || interval > 1440) {
        consoleReporter.printError(
          new Error('Interval must be between 1 and 1440 minutes (1 day)')
        );
        process.exit(1);
      }

      // Validate severity
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      const minSeverity = options.minSeverity?.toLowerCase();
      if (!validSeverities.includes(minSeverity)) {
        consoleReporter.printError(
          new Error(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`)
        );
        process.exit(1);
      }

      // Validate days
      const daysValidation = validateDays(options.days);
      if (!daysValidation.valid) {
        consoleReporter.printError(new Error(daysValidation.error!));
        process.exit(1);
      }
      const days = daysValidation.sanitized as number;

      // Build WatchConfig
      const config: WatchConfig = {
        organization: org,
        token,
        intervalMinutes: interval,
        minSeverity: minSeverity as 'low' | 'medium' | 'high' | 'critical',
        lookbackDays: days,
        enableAI: options.ai !== false,
        alertChannels: ['console'],
        once: options.once || false,
        resetState: options.reset || false,
        verbose: options.verbose || false,
      };

      // Create orchestrator (it creates its own services internally)
      const orchestrator = new WatchOrchestrator(config);

      // Start watching
      consoleReporter.printSuccess(
        `🔍 Starting watch mode for ${org} (interval: ${interval}min, severity: ${minSeverity}+)`
      );

      if (config.once) {
        consoleReporter.printInfo('Running one-shot scan...');
      } else {
        consoleReporter.printInfo('Press Ctrl+C to stop monitoring gracefully\n');
      }

      await orchestrator.start();
    } catch (error) {
      consoleReporter.printError(error as Error);
      process.exit(1);
    }
  });

program
  .command('query [question]')
  .description('Ask natural language questions about organization security')
  .option('-o, --org <organization>', 'GitHub organization name')
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('--anthropic-key <key>', 'Anthropic API key')
  .option('--from <file>', 'Use saved analysis from JSON file')
  .option('-d, --days <number>', 'Number of days to analyze', '30')
  .option('-i, --interactive', 'Interactive mode with follow-up questions')
  .option('--skip-warning', 'Skip data sharing consent warning')
  .action(async (question, options) => {
    const consoleReporter = new ConsoleReporter();

    try {
      const { SecurityQueryService } = await import('./services/security-query-service.js');
      const { readFileSync } = await import('node:fs');
      const { createInterface } = await import('node:readline');

      // Get API key
      const anthropicKey = options.anthropicKey || process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        consoleReporter.printError(
          new Error('Anthropic API key required. Set ANTHROPIC_API_KEY or use --anthropic-key')
        );
        process.exit(1);
      }

      // Check for explicit consent
      const hasConsent = process.env.CONSENT_AI_SHARING === 'true' || options.skipWarning;

      if (!hasConsent) {
        console.log('');
        console.log('⚠️  DATA SHARING NOTICE');
        console.log('━'.repeat(60));
        console.log("This command will send your organization's security analysis data to");
        console.log('the Anthropic API (Claude AI) for natural language processing.');
        console.log('');
        console.log('Data shared includes:');
        console.log('  • Repository names and statistics');
        console.log('  • Security issue descriptions and severity levels');
        console.log('  • Pull request and workflow information');
        console.log('');
        console.log('To skip this warning in the future, set:');
        console.log('  export CONSENT_AI_SHARING=true');
        console.log('');

        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const consent = await new Promise<string>((resolve) => {
          rl.question('Do you want to continue? (y/N): ', (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
          });
        });

        if (consent !== 'y' && consent !== 'yes') {
          console.log('Cancelled by user.');
          process.exit(0);
        }
        console.log('');
      }

      let analysisResult: AnalysisResult;

      // Load analysis from file or fetch fresh data
      if (options.from) {
        try {
          consoleReporter.printInfo(`Loading analysis from ${options.from}...`);

          // Validate file path to prevent traversal attacks
          const safePath = validateFilePath(options.from, {
            allowedExtensions: ['.json'],
          });

          const data = readFileSync(safePath, 'utf-8');
          const parsed = JSON.parse(data);

          // Validate JSON structure
          if (!parsed.statistics || !Array.isArray(parsed.issues)) {
            throw new Error(
              'Invalid analysis file format. Expected AnalysisResult with statistics and issues.'
            );
          }

          analysisResult = parsed;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('path traversal')) {
              consoleReporter.printError(
                new Error(
                  `Security error: ${error.message}\nFor security, analysis files must be in the current directory or subdirectories.`
                )
              );
            } else {
              consoleReporter.printError(
                new Error(`Failed to load analysis file: ${error.message}`)
              );
            }
          }
          process.exit(1);
        }
      } else {
        // Get org and token
        const tokenInput = options.token || process.env.GITHUB_TOKEN;
        const orgInput = options.org || process.env.GITHUB_ORG;

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
        const daysValidation = validateDays(options.days);
        if (!daysValidation.valid) {
          consoleReporter.printError(new Error(daysValidation.error!));
          process.exit(1);
        }
        const days = daysValidation.sanitized as number;

        // Fetch fresh analysis
        const spinner = ora('Fetching organization data...').start();
        const fetcher = new GitHubFetcher(token, org);

        const repositories = await fetcher.getRepositories();
        spinner.text = `Fetched ${repositories.length} repositories, fetching PRs...`;

        const pullRequests = await fetcher.getRecentPullRequests(days);
        spinner.succeed(`Analyzed ${repositories.length} repos and ${pullRequests.length} PRs`);

        const analyzer = new SecurityAnalyzer();
        analysisResult = analyzer.generateAnalysisResult(repositories, pullRequests);
      }

      // Initialize query service
      const queryService = new SecurityQueryService(anthropicKey);

      try {
        // Interactive mode
        if (options.interactive || !question) {
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          consoleReporter.printSuccess(
            'Interactive query mode. Type your questions or "exit" to quit.\n'
          );

          const askQuestion = () => {
            rl.question("? Ask about your organization's security: ", async (input) => {
              const trimmed = input.trim();

              if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
                rl.close();
                return;
              }

              if (!trimmed) {
                askQuestion();
                return;
              }

              const spinner = ora('Analyzing...').start();
              try {
                const result = await queryService.query(trimmed, analysisResult);
                spinner.stop();

                console.log(`\n${result.answer}\n`);

                if (result.relatedIssues && result.relatedIssues.length > 0) {
                  console.log(`📋 Related issues: ${result.relatedIssues.length}`);
                  for (const issue of result.relatedIssues.slice(0, 3)) {
                    console.log(
                      `  • [${issue.severity}] ${issue.repository}: ${issue.description}`
                    );
                  }
                  console.log('');
                }

                askQuestion();
              } catch (error) {
                spinner.stop();
                consoleReporter.printError(error as Error);
                askQuestion();
              }
            });
          };

          await new Promise<void>((resolve) => {
            rl.on('close', resolve);
            askQuestion();
          });
        } else {
          // Single question mode
          const spinner = ora('Analyzing your question...').start();
          const result = await queryService.query(question, analysisResult);
          spinner.stop();

          console.log(`\n${result.answer}\n`);

          if (result.relatedIssues && result.relatedIssues.length > 0) {
            console.log(`📋 ${result.relatedIssues.length} related issues found\n`);
            for (const issue of result.relatedIssues.slice(0, 5)) {
              console.log(`  • [${issue.severity}] ${issue.repository}`);
              console.log(`    ${issue.description}`);
            }
            console.log('');
          }

          if (result.recommendations && result.recommendations.length > 0) {
            console.log('💡 Recommendations:\n');
            for (const rec of result.recommendations) {
              console.log(`  • ${rec}`);
            }
            console.log('');
          }
        }
      } finally {
        // Always cleanup, even on error
        await queryService.dispose();
      }
    } catch (error) {
      consoleReporter.printError(error as Error);
      process.exit(1);
    }
  });

// Repository List Commands
const listCmd = program.command('list').description('Manage repository lists');

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
        console.log('📊 Summary:');
        console.log(`  • Total Repositories: ${report.summary.totalRepos}`);
        console.log(
          `  • Actions Enabled: ${report.summary.actionsEnabled}/${report.summary.totalRepos}`
        );
        console.log(
          `  • Security Enabled: ${report.summary.securityEnabled}/${report.summary.totalRepos}`
        );
        console.log(`  • Total Issues: ${report.summary.totalIssues}`);
        console.log(`  • Critical Issues: ${report.summary.criticalIssues}`);
        console.log(`  • High Issues: ${report.summary.highIssues}\n`);

        if (report.recommendations.length > 0) {
          console.log('💡 Recommendations:');
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
