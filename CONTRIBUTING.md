# Contributing to Browser Interceptor

Thank you for your interest in contributing to Browser Interceptor! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm
- Chrome browser (for testing the extension)

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/browser-interceptor.git
   cd browser-interceptor
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/william2809/browser-interceptor/issues)
2. If not, create a new issue using the bug report template
3. Include:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser version and OS

### Suggesting Features

1. Check existing issues for similar suggestions
2. Create a new issue using the feature request template
3. Describe the feature and its use case

### Submitting Code

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following our coding guidelines
3. Write or update tests as needed
4. Ensure all tests pass:
   ```bash
   npm test
   ```
5. Commit your changes with clear, descriptive messages
6. Push to your fork and submit a pull request

## Coding Guidelines

### Code Style

- Use ES modules (`import`/`export`)
- Use meaningful variable and function names
- Keep functions focused and single-purpose
- Add comments for complex logic (explain "why", not "what")

### File Organization

- **Handlers**: Place new handlers in `src/handlers/`
- **Storage utilities**: Add to `src/lib/storage.js`
- **UI components**: Modify files in `src/popup/`
- **Tests**: Add corresponding tests in `tests/`

### Handler Pattern

When creating a new handler:

```javascript
import { BaseHandler } from './base-handler.js';

export class MyHandler extends BaseHandler {
  constructor() {
    super('my-handler');
  }

  matches(details) {
    // Return true if this handler should process the request
  }

  extract(details) {
    // Return extracted token object or null
    return {
      type: 'my-type',
      value: extractedValue,
      source: { domain, path }
    };
  }
}
```

### Testing Requirements

- All new handlers must have corresponding tests
- Test both `matches()` and `extract()` methods
- Include edge cases and error scenarios
- Use the mock helpers from `tests/setup.js`

## Security Guidelines

**This extension must remain 100% local. Never add:**

- External network requests (`fetch`, `XMLHttpRequest`, WebSockets)
- Analytics or telemetry
- External dependencies that make network calls
- Code that transmits captured data anywhere

If you're unsure whether a change violates these guidelines, please ask in your PR.

## Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure CI passes
4. Request review from maintainers
5. Address review feedback
6. Once approved, a maintainer will merge your PR

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for helping make Browser Interceptor better!
