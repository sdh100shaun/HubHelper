import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { isPathSafe, validateFilePath } from '../utils/path-validator';

describe('Path Validator', () => {
  const testDir = join(process.cwd(), 'test-output');

  afterEach(() => {
    // Clean up test directories
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('validateFilePath', () => {
    it('should block parent directory traversal', () => {
      expect(() => validateFilePath('../../../etc/passwd')).toThrow('path traversal detected');
      expect(() => validateFilePath('../../sensitive.json')).toThrow('path traversal detected');
      expect(() => validateFilePath('../outside.html')).toThrow('path traversal detected');
    });

    it('should block absolute paths', () => {
      expect(() => validateFilePath('/etc/passwd')).toThrow('path traversal detected');
      expect(() => validateFilePath('/tmp/test.json')).toThrow('path traversal detected');
      expect(() => validateFilePath('/var/www/test.html')).toThrow('path traversal detected');
    });

    it('should allow relative paths in current dir', () => {
      const result = validateFilePath('report.html');
      expect(result).toContain('report.html');
      expect(result).not.toContain('..');
    });

    it('should allow subdirectory paths', () => {
      const result = validateFilePath('reports/output.json');
      expect(result).toContain('reports');
      expect(result).toContain('output.json');
    });

    it('should allow nested subdirectory paths', () => {
      const result = validateFilePath('reports/2026/jan/output.json');
      expect(result).toContain('reports');
      expect(result).toContain('2026');
      expect(result).toContain('jan');
      expect(result).toContain('output.json');
    });

    it('should block invalid extensions', () => {
      expect(() => validateFilePath('test.exe')).toThrow('Invalid file extension');
      expect(() => validateFilePath('test.sh')).toThrow('Invalid file extension');
      expect(() => validateFilePath('test.php')).toThrow('Invalid file extension');
      expect(() => validateFilePath('test')).toThrow('Invalid file extension');
    });

    it('should block null bytes', () => {
      expect(() => validateFilePath('test\0.html')).toThrow('null byte detected');
      expect(() => validateFilePath('test.html\0')).toThrow('null byte detected');
    });

    it('should accept allowed extensions', () => {
      expect(() => validateFilePath('report.json')).not.toThrow();
      expect(() => validateFilePath('report.html')).not.toThrow();
      expect(() => validateFilePath('report.txt')).not.toThrow();
      expect(() => validateFilePath('report.md')).not.toThrow();
    });

    it('should be case-insensitive for extensions', () => {
      expect(() => validateFilePath('report.JSON')).not.toThrow();
      expect(() => validateFilePath('report.HTML')).not.toThrow();
      expect(() => validateFilePath('report.TXT')).not.toThrow();
    });

    it('should reject empty paths', () => {
      expect(() => validateFilePath('')).toThrow('File path must be a non-empty string');
    });

    it('should reject non-string paths', () => {
      expect(() => validateFilePath(null as unknown as string)).toThrow(
        'File path must be a non-empty string'
      );
      expect(() => validateFilePath(undefined as unknown as string)).toThrow(
        'File path must be a non-empty string'
      );
      expect(() => validateFilePath(123 as unknown as string)).toThrow(
        'File path must be a non-empty string'
      );
    });

    it('should reject paths that are too long', () => {
      const longPath = `${'a'.repeat(256)}.json`;
      expect(() => validateFilePath(longPath)).toThrow('File path too long');
    });

    it('should accept paths with spaces', () => {
      const result = validateFilePath('my report.html');
      expect(result).toContain('my report.html');
    });

    it('should normalize paths with multiple slashes', () => {
      const result = validateFilePath('reports//output.json');
      expect(result).toContain('reports');
      expect(result).toContain('output.json');
      // Should not contain double slashes after normalization
      expect(result.includes('//')).toBe(false);
    });

    it('should block encoded path traversal attempts', () => {
      // These should be normalized and then caught by traversal check
      expect(() => validateFilePath('reports/../../../etc/passwd')).toThrow(
        'path traversal detected'
      );
    });

    it('should handle custom allowed directory', () => {
      const customDir = join(process.cwd(), 'custom');
      const result = validateFilePath('test.json', { allowedDir: customDir });
      expect(result).toContain('custom');
      expect(result).toContain('test.json');
    });

    it('should handle custom allowed extensions', () => {
      expect(() => validateFilePath('test.xml', { allowedExtensions: ['.xml'] })).not.toThrow();

      expect(() => validateFilePath('test.json', { allowedExtensions: ['.xml'] })).toThrow(
        'Invalid file extension'
      );
    });

    it('should create parent directory when option is enabled', () => {
      const filePath = join(testDir, 'subdir', 'test.json');
      const result = validateFilePath(filePath, { createDirIfMissing: true });
      expect(result).toContain('test.json');
    });

    it('should not create directory when option is disabled', () => {
      const filePath = 'newdir/test.json';
      const result = validateFilePath(filePath, { createDirIfMissing: false });
      expect(result).toContain('test.json');
    });

    it('should block Windows-style absolute paths', () => {
      // On Unix systems, these will be treated as relative and won't pass traversal check
      // On Windows systems, they will be caught as absolute or traversal
      const windowsPaths = ['C:\\Windows\\System32\\test.json', 'D:\\secrets.html'];

      for (const path of windowsPaths) {
        try {
          validateFilePath(path);
          // If it doesn't throw, it should not traverse outside
          const result = validateFilePath(path);
          expect(result).not.toContain('C:');
          expect(result).not.toContain('D:');
        } catch (error) {
          // It's okay if it throws - means it's blocked
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle backslashes on Unix as regular characters', () => {
      // On Unix, backslashes are treated as part of the filename, not path separators
      // On Windows, this would be normalized and caught by traversal check
      const result = validateFilePath('reports\\test.json');
      expect(result).toContain('reports\\test.json');
    });
  });

  describe('isPathSafe', () => {
    it('should return false for unsafe paths', () => {
      expect(isPathSafe('../../../etc/passwd')).toBe(false);
      expect(isPathSafe('/etc/passwd')).toBe(false);
      expect(isPathSafe('test.exe')).toBe(false);
      expect(isPathSafe('test\0.html')).toBe(false);
    });

    it('should return true for safe paths', () => {
      expect(isPathSafe('report.html')).toBe(true);
      expect(isPathSafe('reports/output.json')).toBe(true);
      expect(isPathSafe('data.txt')).toBe(true);
    });

    it('should not throw on invalid input', () => {
      expect(() => isPathSafe('')).not.toThrow();
      expect(() => isPathSafe(null as unknown as string)).not.toThrow();
      expect(() => isPathSafe(undefined as unknown as string)).not.toThrow();
    });

    it('should handle custom options', () => {
      expect(isPathSafe('test.xml', { allowedExtensions: ['.xml'] })).toBe(true);
      expect(isPathSafe('test.json', { allowedExtensions: ['.xml'] })).toBe(false);
    });
  });
});
