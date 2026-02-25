# Software Bill of Materials (SBOM)

## Overview

This project generates Software Bill of Materials (SBOM) documents in compliance with supply chain security best practices. SBOMs provide a comprehensive inventory of all software components, libraries, and dependencies used in the project.

## SBOM Format

We use **CycloneDX 1.6** specification, an industry-standard OWASP-maintained format for SBOM generation.

- **Format**: CycloneDX
- **Specification Version**: 1.6
- **Output Formats**: JSON and XML
- **Published Format**: JSON (included in npm package)

## Generating SBOMs

### Local Generation

Generate SBOM documents locally:

```bash
# Generate JSON format (default)
npm run sbom:generate

# Generate XML format
npm run sbom:generate:xml

# Generate both formats
npm run sbom:all
```

### Automatic Generation

SBOMs are automatically generated during:

1. **npm publish** - via `prepublishOnly` hook
2. **GitHub Releases** - attached as release assets
3. **CI/CD Pipeline** - uploaded as artifacts for every build
4. **Pull Requests** - generated for validation

## SBOM Contents

Each SBOM includes:

- **Metadata**
  - Project name, version, and description
  - License information
  - Repository URLs
  - Generation timestamp
  - Tool information (CycloneDX npm generator)

- **Components**
  - All production dependencies
  - All development dependencies
  - Version information
  - License data
  - Package URLs (PURLs)
  - Checksums and hashes

- **Dependencies**
  - Dependency tree and relationships
  - Direct vs. transitive dependencies
  - Scope (required/optional)

- **Vulnerabilities** (if known)
  - CVE identifiers
  - Severity ratings
  - Affected versions

## Using SBOMs

### Security Analysis

Upload SBOMs to security analysis platforms:

- **OWASP Dependency-Track** - Open-source component analysis
- **Anchore** - Container and software supply chain analysis
- **Snyk** - Vulnerability scanning and license compliance
- **GitHub Dependency Graph** - Native GitHub integration

### Compliance & Auditing

Use SBOMs for:

- **License compliance** - Identify all open source licenses
- **Supply chain security** - Track component provenance
- **Vulnerability management** - Rapid response to security advisories
- **Regulatory compliance** - Meet requirements like NTIA, Executive Order 14028
- **Procurement decisions** - Evaluate security posture

### CI/CD Integration

The SBOM workflow (`.github/workflows/sbom.yml`) automatically:

1. Generates SBOMs on every push to main
2. Validates SBOM format and structure
3. Analyzes dependency counts and composition
4. Uploads artifacts (retained for 90 days)
5. Attaches SBOMs to GitHub releases

## SBOM Files

### In Repository

- `sbom.json` - Generated but gitignored (created during build)
- `sbom.xml` - Generated but gitignored (created during build)

### In npm Package

- `sbom.json` - Included in published package (see `package.json` files array)

### In GitHub Releases

- `sbom.json` - Attached to release assets
- `sbom.xml` - Attached to release assets

## Verification

### Validate SBOM Format

```bash
# Check JSON is valid
jq empty sbom.json

# View metadata
jq '.metadata' sbom.json

# Count components
jq '.components | length' sbom.json

# List all component names
jq -r '.components[].name' sbom.json
```

### View SBOM Summary

```bash
# Display high-level information
jq '{
  specVersion,
  version,
  componentCount: (.components | length),
  dependencyCount: (.dependencies | length),
  metadata: .metadata.component
}' sbom.json
```

### Check for Vulnerabilities

```bash
# This is a placeholder - integrate with actual vulnerability databases
# Example tools:
# - grype sbom.json
# - trivy sbom sbom.json
# - osv-scanner --sbom sbom.json
```

## Standards Compliance

This SBOM implementation complies with:

- **NTIA Minimum Elements** - All required fields included
- **OWASP CycloneDX** - Industry-standard format
- **SPDX Compatibility** - Can be converted to SPDX format if needed
- **Supply Chain Levels for Software Artifacts (SLSA)** - Level 2+ compliance
- **Executive Order 14028** - Federal software security requirements

## Integration with Security Scanning

### GitHub Actions Integration

```yaml
- name: Security scan with SBOM
  run: |
    # Upload to Dependency-Track
    curl -X POST "https://dependency-track.example.com/api/v1/bom" \
      -H "X-Api-Key: ${{ secrets.DTRACK_API_KEY }}" \
      -H "Content-Type: application/json" \
      -d @sbom.json
```

### Dependency-Track Setup

```bash
# Upload SBOM to Dependency-Track server
curl -X POST "https://dtrack.example.com/api/v1/bom" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @sbom.json
```

### Grype Vulnerability Scanning

```bash
# Install grype
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh

# Scan SBOM
grype sbom:sbom.json
```

## SBOM Maintenance

### Updating SBOMs

SBOMs are automatically regenerated when:

- Dependencies are added/updated
- Versions are bumped
- Releases are published

### Manual Update

Force regenerate SBOM:

```bash
npm run sbom:all
```

### Verification in CI

The SBOM workflow includes validation steps:

1. **Format validation** - Ensures valid JSON/XML
2. **Metadata check** - Verifies required fields
3. **Dependency analysis** - Counts and categorizes components
4. **Security placeholder** - Ready for vulnerability scanning integration

## Best Practices

### For Developers

- ✅ Run `npm run sbom:generate` after updating dependencies
- ✅ Review SBOM before releases
- ✅ Keep CycloneDX npm package updated
- ✅ Integrate SBOM scanning into security workflow

### For Security Teams

- ✅ Download SBOMs from GitHub releases
- ✅ Import into security scanning platforms
- ✅ Monitor for vulnerability advisories
- ✅ Establish response procedures for identified risks

### For Compliance

- ✅ Archive SBOMs for each release
- ✅ Include in security documentation
- ✅ Provide to customers/auditors on request
- ✅ Map to license compliance requirements

## Troubleshooting

### SBOM not generated

```bash
# Check CycloneDX is installed
npm list @cyclonedx/cyclonedx-npm

# Reinstall if missing
npm install --save-dev @cyclonedx/cyclonedx-npm
```

### Invalid SBOM format

```bash
# Validate JSON
jq empty sbom.json

# Check spec version
jq -r '.specVersion' sbom.json
```

### Missing components

```bash
# Ensure all dependencies are installed
npm ci

# Regenerate
npm run sbom:generate
```

## Resources

- [CycloneDX Specification](https://cyclonedx.org/specification/overview/)
- [NTIA SBOM Minimum Elements](https://www.ntia.gov/files/ntia/publications/sbom_minimum_elements_report.pdf)
- [OWASP Dependency-Track](https://dependencytrack.org/)
- [CISA SBOM Resources](https://www.cisa.gov/sbom)
- [Executive Order 14028](https://www.nist.gov/itl/executive-order-14028-improving-nations-cybersecurity)

## Support

For questions or issues with SBOM generation, please:

1. Check this documentation
2. Review the SBOM workflow logs in GitHub Actions
3. Open an issue with the SBOM label
4. Contact the security team

---

**Last Updated**: 2026-02-25
**SBOM Version**: 1.6
**Tool**: @cyclonedx/cyclonedx-npm
