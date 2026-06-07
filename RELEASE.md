# Release Process

This document describes the automated release pipeline for `@frontal-labs/mcp-server`.

## Overview

Releases are fully automated via GitHub Actions. When changes are merged to `main`, the pipeline:

1. Publishes the package to npm with provenance
2. Creates a GitHub Release with changelog
3. Builds and pushes multi-arch Docker images to GitHub Container Registry (GHCR)
4. Signs images with cosign (keyless/OIDC)
5. Attaches SBOM attestations

The project uses [Changesets](https://github.com/changesets/changesets) for version management and follows [Semantic Versioning](https://semver.org/) via conventional commits.

---

## Release Pipeline Architecture

The pipeline consists of three coordinated workflows:

### 1. CI (`ci.yml`)

Triggered on every push and pull request to `main` and `develop`. Runs:

- **Lint and Format** — Biome linter and formatter
- **Type Check** — TypeScript compiler type checking
- **Test** — Vitest test suite with coverage (uploaded to Codecov)
- **Build** — tsup production build (artifacts uploaded)
- **Security Audit** — Snyk dependency scanning

CI must pass before any release can proceed.

### 2. Release (`release.yml`)

Triggered on push to `main` (when `package.json` changes) or via `workflow_dispatch`. This is the unified release pipeline with four sequential stages:

1. **Validate** — Runs linting, formatting check, type check, test suite with coverage (uploaded to Codecov), and Snyk security scan
2. **npm Publish** — Extracts version from `package.json`, checks if already published (idempotent via git tag), builds with tsup, publishes to npm with OIDC provenance
3. **GitHub Release** — Extracts the version's changelog section from `CHANGELOG.md`, creates a git tag, and publishes a GitHub Release with the CLI binary attached
4. **Docker Publish** — Builds multi-arch image (linux/amd64, linux/arm64), pushes to GHCR with semver/SHA/latest tags, signs with cosign (keyless/OIDC), and attests SBOM

### 3. Docker Publish (`docker-publish.yml`)

A standalone workflow for Docker-only publishes. Triggered on push to `main` (when relevant files change: `Dockerfile`, `package.json`, `src/**`), and can also be called via `workflow_call` from other workflows or triggered manually via `workflow_dispatch`. This workflow:

1. Sets up QEMU and Docker Buildx for multi-arch builds
2. Logs in to GHCR (`ghcr.io/frontal-labs/mcp-server`)
3. Extracts the version from `package.json`
4. Generates Docker metadata tags (semver, SHA, latest)
5. Builds and pushes multi-arch images with SBOM and provenance attestation
6. Signs the image with cosign (keyless/OIDC)

---

## Version Management

### Changesets

All changes that should trigger a release must include a changeset:

```bash
# Add a changeset for your changes
bun run changeset
```

This prompts you to select the bump type (major, minor, patch) and write a summary. The changeset file is committed alongside your code.

### Conventional Commits

The project uses conventional commits (`@commitlint/config-conventional`) to enforce commit message format:

- `feat:` — minor version bump (new feature)
- `fix:` — patch version bump (bug fix)
- `BREAKING CHANGE:` — major version bump (breaking change)
- `chore:`, `docs:`, `refactor:`, `test:` — no version bump

### Version Commands

```bash
# Add a changeset
bun run changeset

# Version packages based on accumulated changesets
bun run version-packages

# Manually build and publish (not typically needed — CI handles this)
bun run release
```

When `changeset version` runs, it:

- Updates `package.json` versions
- Updates `CHANGELOG.md` with the changeset summaries
- Resets the changeset files

---

## Release Triggers

### Automatic (push to main)

Pushing to `main` triggers:

1. **CI workflow** — validates the code
2. **Release workflow** — validates, publishes to npm, creates GitHub Release, and pushes Docker images to GHCR
3. **Docker Publish workflow** — standalone Docker image publishing (also triggered by relevant file changes)

### Manual (workflow_dispatch)

Both release and Docker workflows can be triggered manually from the GitHub UI:

1. Navigate to **Actions > Release** or **Actions > Docker Publish**
2. Click **Run workflow**
3. Select the branch and provide optional inputs

For the Docker workflow, you can specify:

- **Additional tags** — comma-separated (default: `latest`)
- **Platforms** — `linux/amd64` or `linux/amd64,linux/arm64`

---

## Release Artifacts

Each release produces:

| Artifact | Location | Notes |
|---|---|---|
| npm package | `@frontal-labs/mcp-server` on npmjs.com | Published with provenance |
| GitHub Release | github.com/frontal-labs/mcp-server/releases | Tagged `v<version>` |
| Docker images | ghcr.io/frontal-labs/mcp-server | Multi-arch, signed, with SBOM |
| SBOM attestation | Attached to Docker image | Generated during build |
| Cosign signature | Stored in sigstore | Keyless/OIDC signing |

---

## Docker Images

### Registry

Images are hosted at:

```
ghcr.io/frontal-labs/mcp-server
```

### Available Tags

The following tags are pushed for each release:

| Tag pattern | Example | Description |
|---|---|---|
| `latest` | `latest` | Most recent stable release |
| `v<semver>` | `v1.0.0` | Exact version |
| `<major>.<minor>` | `1.0` | Major.minor version |
| `<major>` | `1` | Major version (points to latest in that major) |
| `sha-<short>` | `sha-a1b2c3d` | Specific commit SHA |

### Pulling Images

```bash
# Pull the latest stable release
docker pull ghcr.io/frontal-labs/mcp-server:latest

# Pull a specific version
docker pull ghcr.io/frontal-labs/mcp-server:v1.0.0

# Pull the latest v1.x release
docker pull ghcr.io/frontal-labs/mcp-server:1
```

### Multi-Arch Support

Images are built for:

- `linux/amd64`
- `linux/arm64`

Docker automatically selects the correct architecture for your host:

```bash
docker pull ghcr.io/frontal-labs/mcp-server:latest
docker run ghcr.io/frontal-labs/mcp-server:latest
```

To inspect the available architectures:

```bash
docker manifest inspect ghcr.io/frontal-labs/mcp-server:latest
```

### Running the Container

```bash
docker run -e FRONTAL_API_KEY=your_key ghcr.io/frontal-labs/mcp-server:latest
```

---

## Release Channels

### latest (stable)

- Published to npm as `@frontal-labs/mcp-server` with the `latest` tag
- Docker image tagged `latest`
- Corresponds to the most recent stable release

### next (pre-release)

Pre-release versions (alpha, beta, rc) are published to npm with the `next` tag:

```bash
npm install @frontal-labs/mcp-server@next
```

Pre-release versions are identified by semver pre-release labels (e.g., `1.1.0-alpha.1`, `1.1.0-beta.0`). When the version contains `alpha`, `beta`, or `rc`, the GitHub Release is marked as a pre-release.

Changesets can create pre-release versions using:

```bash
bun x changeset pre enter next
bun x changeset version
bun x changeset pre exit
```

---

## Post-Release Verification

After a release completes, verify the following:

### npm Package

```bash
# Install the latest version
npm install -g @frontal-labs/mcp-server@latest

# Check the installed version
frontal-mcp-server --version

# Verify provenance (npm 9+)
npm audit signatures
```

### Docker Image

```bash
# Pull and verify the image
docker pull ghcr.io/frontal-labs/mcp-server:latest

# Run a quick smoke test
docker run --rm ghcr.io/frontal-labs/mcp-server:latest --help

# Verify the image signature
cosign verify ghcr.io/frontal-labs/mcp-server:latest \
  --certificate-identity-regexp="https://github.com/frontal-labs/mcp-server/.github/workflows/docker-publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

### GitHub Release

- Confirm the release appears at github.com/frontal-labs/mcp-server/releases
- Confirm the git tag (`v<version>`) exists

---

## Rollback Process

If a critical issue is discovered in a release:

### 1. Deprecate the npm Package

```bash
npm deprecate @frontal-labs/mcp-server@<bad-version> "Critical issue — use <previous-version> instead"
```

### 2. Revert Docker Image

Docker images are immutable. To revert:

- Pull the previous working image and re-tag it as `latest`
- Or update consumers to pin to the last known-good version:

```bash
docker pull ghcr.io/frontal-labs/mcp-server:v<previous-version>
```

### 3. Fix and Release a Patch

1. Create a fix branch from the last stable tag
2. Apply the fix
3. Add a changeset with `patch` bump
4. Merge to `main` — the pipeline publishes a new patch version

### 4. Communicate

- Update the GitHub Release to note the deprecation
- Notify users via the repository's communication channels

---

## Security

### Image Signing (cosign)

Docker images are signed with cosign using keyless (OIDC) signing via GitHub OIDC tokens. Signatures are stored in sigstore's transparency log.

```bash
# Verify a signed image
cosign verify ghcr.io/frontal-labs/mcp-server:latest \
  --certificate-identity-regexp="https://github.com/frontal-labs/mcp-server/.github/workflows/docker-publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

### npm Provenance

npm packages are published with `--provenance`, which uses GitHub's OIDC token to link the package to its source repository and build pipeline. Verify with:

```bash
npm audit signatures
```

### SBOM

Each Docker image includes a Software Bill of Materials (SBOM) generated by Docker BuildKit during the build. The SBOM is attested to the image and lists all dependencies.

---

## Release Checklist

- [ ] Changes tested locally: `bun run test`
- [ ] Code formatted and linted: `bun run lint`
- [ ] Type check passes: `bun run type-check`
- [ ] Changeset added for all user-facing changes: `bun run changeset`
- [ ] Changeset committed and pushed to `main`
- [ ] CI workflow passes on `main` (lint, type-check, test, build, security)
- [ ] Release workflow completes successfully
- [ ] Docker Publish workflow completes successfully
- [ ] npm package is published and installable: `npm install -g @frontal-labs/mcp-server@latest`
- [ ] Docker image is pullable: `docker pull ghcr.io/frontal-labs/mcp-server:latest`
- [ ] GitHub Release created with correct version tag
- [ ] Image signature verified with cosign
- [ ] Post-release smoke test passes

---

## Manual Release (emergency)

If you need to release without the automated pipeline (e.g., CI is down), you can publish manually:

```bash
# 1. Ensure working directory is clean
git status

# 2. Install dependencies and build
bun install --frozen-lockfile
bun run build

# 3. Publish to npm
npm publish --access public --provenance

# 4. Tag the release
git tag v$(node -e "console.log(require('./package.json').version)")
git push origin v$(node -e "console.log(require('./package.json').version)")
```

> Manual releases skip Docker image publishing and cosign signing. Revert to CI as soon as possible.

---

## Support

For questions about the release process:

- Create an issue in the repository
- Contact the maintainers
- Check existing documentation and issues
