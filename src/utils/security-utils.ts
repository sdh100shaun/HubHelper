const SECURITY_KEYWORDS = [
  'security',
  'vulnerability',
  'cve',
  'xss',
  'sql injection',
  'csrf',
  'auth',
  'authentication',
  'authorization',
  'encrypt',
  'secret',
  'token',
  'credential',
  'dependabot',
  'snyk',
  'password',
  'privilege',
  'permission',
];

const SECURITY_LABELS = ['security', 'vulnerability', 'dependabot'];
const SECURITY_FILES = ['.github/workflows/', 'security.md', 'Dockerfile', '.env'];

export function isSecurityRelated(
  title: string,
  body: string,
  labels: string[],
  files: string[]
): boolean {
  const text = `${title} ${body}`.toLowerCase();
  const hasKeyword = SECURITY_KEYWORDS.some((keyword) => text.includes(keyword));
  const hasLabel = labels.some((label) =>
    SECURITY_LABELS.some((sl) => label.toLowerCase().includes(sl))
  );
  const hasSecurityFile = files.some((file) => SECURITY_FILES.some((sf) => file.includes(sf)));

  return hasKeyword || hasLabel || hasSecurityFile;
}
