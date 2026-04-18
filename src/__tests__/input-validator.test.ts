import {
  validateDays,
  validateGitHubToken,
  validateOrganizationName,
} from '../utils/input-validator';

describe('Input Validator', () => {
  describe('validateOrganizationName', () => {
    it('should accept valid org names', () => {
      expect(validateOrganizationName('github').valid).toBe(true);
      expect(validateOrganizationName('my-org').valid).toBe(true);
      expect(validateOrganizationName('org123').valid).toBe(true);
      expect(validateOrganizationName('test-org-123').valid).toBe(true);
      expect(validateOrganizationName('a').valid).toBe(true);
    });

    it('should sanitize and trim org names', () => {
      const result = validateOrganizationName('  github  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('github');
    });

    it('should reject invalid characters', () => {
      expect(validateOrganizationName('org_name').valid).toBe(false);
      expect(validateOrganizationName('org name').valid).toBe(false);
      expect(validateOrganizationName('../etc').valid).toBe(false);
      expect(validateOrganizationName('org@name').valid).toBe(false);
      expect(validateOrganizationName('org.name').valid).toBe(false);
      expect(validateOrganizationName('org/name').valid).toBe(false);
    });

    it('should reject too long names', () => {
      const longName = 'a'.repeat(40);
      const result = validateOrganizationName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject names starting with hyphen', () => {
      const result = validateOrganizationName('-myorg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid organization name format');
    });

    it('should reject names ending with hyphen', () => {
      const result = validateOrganizationName('myorg-');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid organization name format');
    });

    it('should reject empty strings', () => {
      const result = validateOrganizationName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject whitespace-only strings', () => {
      const result = validateOrganizationName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject null and undefined', () => {
      expect(validateOrganizationName(null).valid).toBe(false);
      expect(validateOrganizationName(undefined).valid).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(validateOrganizationName(123).valid).toBe(false);
      expect(validateOrganizationName({}).valid).toBe(false);
      expect(validateOrganizationName([]).valid).toBe(false);
    });

    it('should reject SQL injection attempts', () => {
      expect(validateOrganizationName("'; DROP TABLE--").valid).toBe(false);
      expect(validateOrganizationName("1' OR '1'='1").valid).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(validateOrganizationName('../../../etc').valid).toBe(false);
      expect(validateOrganizationName('..').valid).toBe(false);
      expect(validateOrganizationName('./test').valid).toBe(false);
    });

    it('should reject special characters', () => {
      expect(validateOrganizationName('org<script>').valid).toBe(false);
      expect(validateOrganizationName('org&test').valid).toBe(false);
      expect(validateOrganizationName('org;test').valid).toBe(false);
    });

    it('should accept maximum valid length', () => {
      const maxName = `a${'b'.repeat(37)}c`; // 39 characters
      expect(validateOrganizationName(maxName).valid).toBe(true);
    });

    it('should reject single hyphen', () => {
      expect(validateOrganizationName('-').valid).toBe(false);
    });

    it('should accept consecutive hyphens in middle', () => {
      expect(validateOrganizationName('org--name').valid).toBe(true);
    });
  });

  describe('validateDays', () => {
    it('should accept valid days as number', () => {
      expect(validateDays(1).valid).toBe(true);
      expect(validateDays(30).valid).toBe(true);
      expect(validateDays(365).valid).toBe(true);
    });

    it('should accept valid days as string', () => {
      const result = validateDays('30');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(30);
    });

    it('should reject negative days', () => {
      expect(validateDays(-1).valid).toBe(false);
      expect(validateDays('-1').valid).toBe(false);
      expect(validateDays(-100).valid).toBe(false);
    });

    it('should reject zero', () => {
      const result = validateDays(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 1');
    });

    it('should reject excessive days', () => {
      const result = validateDays(999999);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed 365');
    });

    it('should reject days over 365', () => {
      expect(validateDays(366).valid).toBe(false);
      expect(validateDays(1000).valid).toBe(false);
      expect(validateDays('999999').valid).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(validateDays('abc').valid).toBe(false);
      expect(validateDays('12abc').valid).toBe(false);
      expect(validateDays('abc12').valid).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(validateDays(null).valid).toBe(false);
      expect(validateDays(undefined).valid).toBe(false);
    });

    it('should reject floating point numbers', () => {
      const result = validateDays(30.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an integer');
    });

    it('should reject floating point strings', () => {
      expect(validateDays('30.5').valid).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(validateDays('').valid).toBe(false);
    });

    it('should reject objects and arrays', () => {
      expect(validateDays({}).valid).toBe(false);
      expect(validateDays([]).valid).toBe(false);
      expect(validateDays([30]).valid).toBe(false);
    });

    it('should accept boundary value 1', () => {
      const result = validateDays(1);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(1);
    });

    it('should accept boundary value 365', () => {
      const result = validateDays(365);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(365);
    });

    it('should reject Infinity', () => {
      expect(validateDays(Number.POSITIVE_INFINITY).valid).toBe(false);
      expect(validateDays(Number.NEGATIVE_INFINITY).valid).toBe(false);
    });

    it('should reject NaN', () => {
      expect(validateDays(Number.NaN).valid).toBe(false);
    });

    it('should reject injection attempts', () => {
      expect(validateDays('30; DROP TABLE--').valid).toBe(false);
      expect(validateDays('30 OR 1=1').valid).toBe(false);
    });

    it('should reject scientific notation if it results in non-integer', () => {
      expect(validateDays('1e2').valid).toBe(false);
    });

    it('should parse string numbers correctly', () => {
      const result = validateDays('100');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(100);
    });
  });

  describe('validateGitHubToken', () => {
    it('should accept valid token format', () => {
      const token = `ghp_${'a'.repeat(40)}`;
      expect(validateGitHubToken(token).valid).toBe(true);
    });

    it('should accept classic tokens', () => {
      const token = 'a'.repeat(40);
      expect(validateGitHubToken(token).valid).toBe(true);
    });

    it('should sanitize and trim tokens', () => {
      const token = `  ${'a'.repeat(40)}  `;
      const result = validateGitHubToken(token);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('a'.repeat(40));
    });

    it('should reject empty tokens', () => {
      expect(validateGitHubToken('').valid).toBe(false);
      expect(validateGitHubToken('   ').valid).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(validateGitHubToken(null).valid).toBe(false);
      expect(validateGitHubToken(undefined).valid).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(validateGitHubToken(123).valid).toBe(false);
      expect(validateGitHubToken({}).valid).toBe(false);
    });

    it('should reject tokens that are too short', () => {
      const result = validateGitHubToken('short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too short');
    });

    it('should reject tokens with whitespace', () => {
      const token = `ghp_${'a'.repeat(20)} ${'a'.repeat(20)}`;
      const result = validateGitHubToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('whitespace');
    });

    it('should reject tokens with newlines', () => {
      const token = `ghp_${'a'.repeat(20)}\n${'a'.repeat(20)}`;
      expect(validateGitHubToken(token).valid).toBe(false);
    });

    it('should reject tokens with tabs', () => {
      const token = `ghp_${'a'.repeat(20)}\t${'a'.repeat(20)}`;
      expect(validateGitHubToken(token).valid).toBe(false);
    });

    it('should accept long valid tokens', () => {
      const token = `ghp_${'a'.repeat(100)}`;
      expect(validateGitHubToken(token).valid).toBe(true);
    });

    it('should accept tokens with underscores', () => {
      const token = `ghp_${'a'.repeat(40)}`;
      expect(validateGitHubToken(token).valid).toBe(true);
    });

    it('should accept fine-grained tokens', () => {
      const token = `github_pat_${'a'.repeat(40)}`;
      expect(validateGitHubToken(token).valid).toBe(true);
    });

    it('should accept OAuth tokens', () => {
      const token = `gho_${'a'.repeat(40)}`;
      expect(validateGitHubToken(token).valid).toBe(true);
    });
  });
});
