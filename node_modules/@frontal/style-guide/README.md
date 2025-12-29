<picture>
  <source srcset="./assets/banner-dark.png" media="(prefers-color-scheme: dark)">
  <source srcset="./assets/banner.png" media="(prefers-color-scheme: light)">
  <img src="./assets/banner.png" alt="Frontal Banner">
</picture>

# Frontal Style-Guide

This repository is the home of Frontal's style guide, which includes configs for popular linting and styling tools.

The following configs are available, and are designed to be used together.

## Contributing

Please read our [contributing](./CONTRIBUTING.md)
guide before creating a pull request.

## Installation

All of our configs are contained in one package, `@frontal/style-guide`. To install:

```sh
# If you use npm
npm i --save-dev @frontal/style-guide

# If you use pnpm
pnpm i --save-dev @frontal/style-guide

# If you use Yarn
yarn add --dev @frontal/style-guide
```

## Biome

This style guide provides a shared Biome configuration for consistent code formatting and linting across the project. 

To use the shared Biome config, set the following in [`biome.jsonc`](./biome.jsonc):

```json
{
  "extends": ["@frontal/style-guide/biome"]
}
```

The Biome configuration includes:
- Code formatting rules
- Linting rules
- Import sorting
- And other best practices for consistent code style

## Rust (rustfmt + Clippy)

We ship native configs you can drop directly into your repo:

- `@frontal/style-guide/rust` → `rustfmt.toml`
- `@frontal/style-guide/rust/Clippy.toml` → `Clippy.toml`

```sh
cp node_modules/@frontal/style-guide/config/rust/rustfmt.toml ./rustfmt.toml
cp node_modules/@frontal/style-guide/config/rust/Clippy.toml ./Clippy.toml
```

These files lock in edition `2021`, grouped imports, doc formatting, and strict Clippy lint levels (warn: `pedantic`, `nursery`; deny: unwrap/expect/todo).

## Python (Ruff)

Use the Ruff-native config exposed at `@frontal/style-guide/python`:

```sh
cp node_modules/@frontal/style-guide/config/python/ruff.toml ./ruff.toml
```

It targets Python 3.12, enforces a 100-character line length, enables Ruff formatting, and selects the `E`, `F`, `I`, `UP`, `B`, `DTZ`, `PL`, and `RUF` rule groups (with `E203`/`E501` ignored for Black compatibility). Tests relax `S101`.

## Go (gofmt + golangci-lint)

The Go lint profile lives at `@frontal/style-guide/go/golangci.yml`:

```sh
cp node_modules/@frontal/style-guide/config/go/golangci.yml ./.golangci.yml
```

It enables `govet`, `staticcheck`, `errcheck`, `gosimple`, `unused`, `goconst`, `gocyclo`, and `revive` with tuned thresholds. Run gofmt with the stock command to enforce canonical formatting:

```sh
gofmt -s -w .
```

## Development

### Building

```bash
pnpm build
```

### Type Checking

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
pnpm lint:fix
```

### Formatting

```bash
pnpm format
```

## Releases

This package uses [Changesets](https://github.com/changesets/changesets) for versioning. The workflow is:

1. Run `pnpm changeset` to document each change (one changeset file per change).
2. Open a pull request with the new changeset(s).
3. When the automated **Release** PR is merged into `main`, the `Release` GitHub Action:
   - runs `pnpm changeset version` to bump package versions and changelogs,
   - creates a git tag via `pnpm run release` (which runs `changeset tag`) and automatically opens a GitHub Release entry (no npm publish).

> ℹ️ We do **not** publish to npm; releases are tracked via git tags and GitHub Releases only.

## License

This package is private and proprietary to Frontal Labs. See [LICENSE.md](./LICENSE.md) for details.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to this package.

### Development Workflow

1. **Fork and clone** the repository
2. **Install dependencies**: `pnpm install`
3. **Make changes** to configuration files
4. **Run tests**: `pnpm lint && pnpm type-check && pnpm build`
5. **Create a pull request** with a clear description

## Repository Structure

```
internals/style-guide/
├── biome.jsonc           # Biome configuration
├── package.json          # Package configuration
├── README.md             # This file
├── CONTRIBUTING.md       # Contributing guidelines
└── .gitignore           # Git ignore rules
```