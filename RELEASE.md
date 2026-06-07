# Release Process

This document describes the release process for the Frontal MCP Server.

## Prerequisites

- Ensure all tests are passing: `bun run test`
- Ensure code is properly formatted: `bun run format`
- Ensure linting passes: `bun run lint`
- Update version in `package.json` if needed
- Update `CHANGELOG.md` with new changes
- Create changeset for the release: `bun run changeset`

## Release Steps

### 1. Prepare Release

```bash
# Ensure working directory is clean
git status

# Run full test suite
bun run test

# Check code quality
bun run lint
bun run type-check

# Build the project
bun run build
```

### 2. Version Management

The project uses [Changesets](https://github.com/changesets/changesets) for version management.

```bash
# Add a changeset for your changes
bun run changeset

# Version packages based on changesets
bun run version-packages

# This will:
# - Update package.json versions
# - Update CHANGELOG.md
# - Create a release commit
```

### 3. Publish Release

```bash
# Build and publish to npm
bun run release

# This will:
# - Build the project
# - Publish to npm registry
# - Create GitHub release
```

### 4. Tag and Push

```bash
# Push the release commit and tags
git push origin main --follow-tags
```

## Automated Release

The project also supports automated releases via GitHub Actions:

- When changesets are merged to `main`
- CI will automatically version and publish
- Releases are created automatically

## Version Format

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Release Channels

### Stable

- Published to npm as `@frontal-labs/mcp-server`
- Tags: `latest`, version numbers (e.g., `1.0.0`)

### Development

- Available via `npm install @frontal-labs/mcp-server@next`
- Tags: `next`, pre-release versions

## Post-Release Tasks

1. **Verification**
   - Test installation from npm
   - Verify Claude Desktop integration
   - Check all MCP tools work correctly

2. **Documentation**
   - Update API documentation if needed
   - Update examples and tutorials

3. **Communication**
   - Announce release in appropriate channels
   - Update project status in README

## Rollback Process

If a critical issue is discovered:

1. **Immediate Actions**
   - Deprecate the problematic version on npm
   - Communicate issue to users

2. **Fix Process**
   - Create hotfix branch from previous stable version
   - Fix the issue
   - Release patch version

3. **Verification**
   - Thoroughly test the fix
   - Ensure no regression

## Release Checklist

- [ ] All tests passing
- [ ] Code formatted and linted
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Changeset created
- [ ] Version bumped correctly
- [ ] Build successful
- [ ] Package published to npm
- [ ] GitHub release created
- [ ] Tags pushed
- [ ] Post-release verification completed

## Support

For questions about the release process:

- Create an issue in the repository
- Contact the maintainers
- Check existing documentation and issues