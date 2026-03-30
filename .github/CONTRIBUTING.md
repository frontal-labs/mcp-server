# Contributing to Frontal MCP Server

Thank you for your interest in contributing to the Frontal MCP Server! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites
- Node.js 18 or higher
- Bun 1.3.8 or higher
- Git

### Getting Started
1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/mcp-server.git`
3. Navigate to the project: `cd mcp-server`
4. Install dependencies: `bun install`
5. Create a new branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Running Tests
```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

### Building
```bash
# Build the project
bun run build

# Build in watch mode
bun run build:watch
```

### Linting and Formatting
```bash
# Run linter
bun run lint

# Format code
bun run format

# Type check
bun run type-check
```

## Code Style

We use Biome for linting and formatting. The configuration is defined in `biome.jsonc`.

### Guidelines
- Use TypeScript for all new code
- Follow the existing code style and patterns
- Write meaningful commit messages following [Conventional Commits](https://www.conventionalcommits.org/)
- Add tests for new functionality
- Update documentation as needed

## Submitting Changes

### Commit Messages
Follow the Conventional Commits format:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for code style changes
- `refactor:` for code refactoring
- `test:` for test changes
- `chore:` for maintenance tasks

Example:
```
feat(server): add support for custom adapters

Add support for custom adapters in the MCP server, allowing
users to extend functionality with their own implementations.

Closes #123
```

### Pull Requests
1. Update your fork with the latest changes from the main repository
2. Create a new branch for your feature or bugfix
3. Make your changes and add tests
4. Ensure all tests pass and the code is properly formatted
5. Submit a pull request with a clear description of your changes

## Testing

### Unit Tests
- Write unit tests for all new functionality
- Use Vitest as the testing framework
- Aim for high test coverage

### Integration Tests
- Integration tests are located in the `tests/integration/` directory
- Test the interaction between different components

## Documentation

- Update API documentation in `docs/API.md`
- Update the README if you add new features
- Add inline code comments for complex logic

## Security

If you discover a security vulnerability, please email security@frontal.cloud instead of opening an issue.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

## Getting Help

- Create an issue for bug reports or feature requests
- Start a discussion for questions
- Check the [documentation](docs/API.md) for API information

## Release Process

Releases are managed using Changesets:
1. Add a changeset for your changes: `bun run changeset`
2. When ready to release, run: `bun run release`

Thank you for contributing! 🚀
