# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in this project, please report it by emailing the maintainer directly or by opening a private security advisory on GitHub.

**Please do not report security vulnerabilities through public GitHub issues.**

We will respond to your report within 48 hours and work with you to address any confirmed vulnerabilities.

## Security Best Practices

### Authentication & Authorization

- **GitHub Token Security**: Never commit your GitHub Personal Access Token to version control
- Store tokens in environment variables or use a secure credential manager
- Use tokens with minimal required scopes (principle of least privilege)
- Rotate tokens regularly and revoke compromised tokens immediately
- Required scopes for this tool:
  - `repo` - Repository access for reading workflows and files
  - `read:org` - Organization member listing
  - `admin:org` - Organization compliance checks (only if using compliance features)

### Data Handling

- This tool processes GitHub API responses but does not store sensitive data persistently
- Logs are sanitized to prevent exposure of tokens or sensitive error details
- HTML and JSON reports may contain organization structure information - handle these reports appropriately

### Dependencies

- Run `npm audit` regularly to check for known vulnerabilities
- Update dependencies promptly when security patches are released
- Dependencies are automatically scanned by Dependabot (if enabled in your fork)

### CI/CD Security

- GitHub Actions workflows use pinned versions for security
- Secrets are managed through GitHub Secrets, never hardcoded
- npm publishing uses provenance attestation for supply chain security

## Security Features

### Input Validation

- All external inputs are validated and sanitized
- Path traversal protection is implemented for file operations
- JSON parsing includes error handling and type validation

### Rate Limiting

- GitHub API rate limits are respected
- Implements pagination to avoid overwhelming the API
- Consider using GitHub App authentication for higher rate limits in production

### Error Handling

- Errors are logged with minimal detail to prevent information disclosure
- Stack traces are not exposed in production outputs
- Failed API calls fail gracefully without exposing tokens

## Security Considerations for Users

### Organization Access

This tool requires significant organizational access. Review the following:

1. **Token Permissions**: Ensure tokens have only the minimum required scopes
2. **Organization Data**: Reports contain organizational structure and activity data
3. **Compliance Checks**: Email compliance features access member information
4. **Audit Trail**: Consider logging tool usage for compliance requirements

### Deployment Security

If deploying this tool in a CI/CD pipeline:

- Use encrypted secrets for tokens
- Limit workflow permissions to minimum required
- Review and approve automated PRs from security scanning
- Implement branch protection rules
- Enable GitHub Actions audit logging

## Threat Model

### In Scope

- GitHub token exposure
- Information disclosure through error messages
- Dependency vulnerabilities
- Supply chain attacks
- Code injection vulnerabilities

### Out of Scope

- GitHub API security (managed by GitHub)
- Network layer attacks (TLS/HTTPS)
- Client-side vulnerabilities in HTML reports (reports are static)

## Security Checklist for Contributors

When contributing code, ensure:

- [ ] No hardcoded credentials or tokens
- [ ] Input validation for all external data
- [ ] Proper error handling without sensitive data exposure
- [ ] Dependencies are up to date
- [ ] Tests cover security-critical code paths
- [ ] No use of dangerous functions (eval, exec without validation)
- [ ] Secrets are properly gitignored

## Version Support

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Acknowledgments

We appreciate the security research community's efforts in identifying and responsibly disclosing vulnerabilities.
