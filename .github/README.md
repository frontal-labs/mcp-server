# GitHub Configuration

This directory contains GitHub-specific configuration files for the Frontal MCP Server project.

## Structure

```
.github/
├── ISSUE_TEMPLATE/          # Issue templates
│   ├── bug_report.yml      # Bug report template
│   ├── feature_request.yml # Feature request template
│   ├── security_issue.yml  # Security issue template
│   └── config.yml         # Issue template configuration
├── workflows/              # GitHub Actions workflows
│   ├── ci.yml            # Continuous integration
│   ├── release.yml       # Release automation
│   ├── dependency-update.yml # Dependency updates
│   ├── codeql-analysis.yml # Security scanning
│   ├── docs-check.yml    # Documentation validation
│   └── dependabot-auto-merge.yml # Auto-merge for dependabot
├── PULL_REQUEST_TEMPLATE.md # PR template
├── CONTRIBUTING.md        # Contributing guidelines
├── CODE_OF_CONDUCT.md     # Community code of conduct
├── SECURITY.md           # Security policy
├── dependabot.yml       # Dependabot configuration
└── README.md           # This file
```

## Workflows

### CI Pipeline (`ci.yml`)
- Runs on every push and pull request to main/develop branches
- Includes linting, type checking, testing, building, and security audit
- Uploads test coverage to Codecov

### Release Pipeline (`release.yml`)
- Triggered by version tags (v*)
- Builds and tests the project
- Creates GitHub releases using Changesets
- Publishes to NPM registry
- Uploads binary artifacts

### Security Workflows
- **CodeQL Analysis**: Weekly security scanning
- **Security Audit**: Dependency vulnerability checks
- **Auto-merge**: Automatic merging of patch updates from Dependabot

### Maintenance Workflows
- **Dependency Updates**: Weekly dependency updates
- **Documentation Check**: Validates markdown files and links

## Issue Templates

- **Bug Report**: Structured bug reporting with environment info
- **Feature Request**: Feature proposals with use cases
- **Security Issue**: Security vulnerability reporting (non-sensitive)

## Configuration Files

- **dependabot.yml**: Automated dependency updates
- **markdownlint.json**: Markdown linting rules
- **CODEOWNERS**: Code ownership rules (if needed)

## Security

- Security vulnerabilities should be reported to: security@frontal.cloud
- Non-sensitive security issues can be reported via GitHub issues
- All security-related PRs require additional review

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please read and follow these guidelines.
