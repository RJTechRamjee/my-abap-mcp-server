# Contributing to ABAP MCP Server

Thank you for your interest in contributing to the AI-Powered ABAP Transport Analyzer MCP Server! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Be respectful and professional. We value diverse perspectives and welcome constructive feedback.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git
- SAP S/4HANA system access (for testing)

### Development Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd my-abap-mcp-server

# 2. Install dependencies
npm install

# 3. Copy and configure environment
cp .env.example .env
# Edit .env with your SAP system details

# 4. Verify setup
npm run build
npm test
```

## Development Workflow

### 1. Create a Feature Branch

```bash
# Update main branch first
git checkout main
git pull origin main

# Create feature branch (use descriptive names)
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `test/` - Test additions/improvements
- `refactor/` - Code refactoring
- `chore/` - Build process, dependencies, etc.
- `security/` - Security improvements

### 2. Make Changes

```bash
# Always build before committing
npm run build

# Run tests
npm test

# Check code formatting
npm run build -- --noEmit
```

### 3. Commit with Clear Messages

Follow conventional commit messages:

```
type(scope): subject

body

footer
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `test` - Testing
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `chore` - Build/tooling

**Examples:**

```
feat(validation): add input sanitization for transport IDs

- Add TRANSPORT_ID_REGEX validation
- Implement sanitizeTransportId() function
- Add comprehensive test suite

Closes #42
```

```
fix(error-handling): improve 401 error messages

The error message now provides more detailed troubleshooting steps
for SAP authorization failures.
```

### 4. Push and Create Pull Request

```bash
# Push to remote
git push origin feature/your-feature-name

# Open PR on GitHub
# Add clear description and link related issues
```

## Code Style & Standards

### TypeScript Guidelines

- Use strict mode (enabled in `tsconfig.json`)
- Add type annotations for function parameters and return types
- Use interfaces for data structures
- Comment complex logic and business rules
- Use meaningful variable and function names

### Naming Conventions

```typescript
// Constants: UPPER_CASE
const MAX_TRANSPORT_ID_LENGTH = 20;

// Functions: camelCase
function validateTransportId(id: string): boolean {}

// Types/Interfaces: PascalCase
interface TransportMetadata {
  transportId: string;
  description: string;
}

// Private methods: _leading underscore (optional but recommended)
private _sanitizeInput(input: string): string {}
```

### Error Handling

```typescript
// ✅ Good: Specific error handling with context
try {
  const metadata = await getTransportMetadata(transportId);
} catch (err: any) {
  errorLog(`Failed to retrieve metadata for ${transportId}`, err);
  return {
    isError: true,
    message: `Unable to fetch transport: ${err.message}`
  };
}

// ❌ Bad: Silent failures or generic catch-alls
try {
  // ...
} catch (e) {
  console.log('Error occurred');
}
```

### Comments & Documentation

```typescript
// ✅ Good: Explain WHY, not WHAT
// Validate transport IDs to prevent SQL injection attacks
function validateTransportId(id: string): boolean {}

// ❌ Bad: Comments that repeat the code
// Set transportId to the input parameter
const transportId = input;
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Run specific test file
npm test -- tests/mcp-server.test.ts
```

### Writing Tests

1. **Test Organization**: Group related tests with `describe()`
2. **Clear Descriptions**: Use "should..." naming convention
3. **Arrange-Act-Assert**: Organize tests clearly
4. **Mock External Services**: Don't make real SAP calls in tests

```typescript
describe('Input Validation', () => {
  test('should reject transport IDs with special characters', () => {
    // Arrange
    const invalidId = 'S4HK@00123';
    const regex = /^[A-Za-z0-9]{1,20}$/;
    
    // Act
    const result = regex.test(invalidId);
    
    // Assert
    expect(result).toBe(false);
  });
});
```

### Coverage Requirements

- Aim for >80% code coverage
- All public functions should have tests
- Test both happy path and error scenarios

## Documentation

### README Updates

Update `README.md` if you:
- Add new features
- Change configuration
- Add new environment variables
- Modify deployment procedures

### Changelog

Add entries to `CHANGELOG.md`:

```markdown
## [1.0.1] - 2026-07-05

### Added
- Input validation for transport IDs
- Structured logging framework

### Fixed
- Improved error handling for 401 responses

### Security
- Sanitize output to prevent injection attacks
```

### Code Comments

Add comments for:
- Complex algorithms
- Non-obvious business logic
- Workarounds for known issues
- SAP-specific considerations

## Security Considerations

### Before Committing

- ✅ Never commit `.env` files or secrets
- ✅ Verify `.gitignore` includes sensitive files
- ✅ Run security checks: `npm audit`
- ✅ Validate input sanitization
- ✅ Check for hardcoded credentials

### Reporting Security Issues

**DO NOT** create public GitHub issues for security vulnerabilities.

Instead, email: `security@your-org.com` with:
1. Description of vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (optional)

## Pull Request Review Process

### Before Submitting

- [ ] Code builds successfully: `npm run build`
- [ ] All tests pass: `npm test`
- [ ] No new security warnings: `npm audit`
- [ ] Changes are documented
- [ ] Commit messages are clear
- [ ] No `.env` or secrets included

### What Reviewers Will Check

1. **Functionality** - Does it work as intended?
2. **Code Quality** - Does it follow standards?
3. **Tests** - Is there adequate test coverage?
4. **Documentation** - Is it well-documented?
5. **Security** - Are there any security concerns?
6. **Performance** - Does it impact performance?

### Responding to Feedback

- Respond to all review comments
- Push additional commits instead of force-pushing
- Request re-review after addressing comments
- Be open to suggestions and learning

## Build & Release Process

### Local Build

```bash
npm run build
```

### Pre-release Testing

```bash
# Full test suite
npm test

# Build and check types
npm run build -- --noEmit

# Security audit
npm audit
```

### Release Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0) - Breaking changes
- **MINOR** (0.1.0) - New features (backward compatible)
- **PATCH** (0.0.1) - Bug fixes

## Getting Help

- **Documentation**: See [README.md](./README.md)
- **Discussions**: Open a GitHub Discussion
- **Issues**: Search existing issues first
- **Community**: Join our Slack/Teams channel

## Recognition

Contributors will be recognized in:
- `CONTRIBUTORS.md` file
- Release notes
- GitHub contributors page

## License

By contributing to this project, you agree that your contributions will be licensed under the ISC License.

---

**Thank you for making ABAP MCP Server better!** 🚀
