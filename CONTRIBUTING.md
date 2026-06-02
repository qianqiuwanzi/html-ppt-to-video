# Contributing to html-ppt-to-video

Thank you for your interest in contributing to **html-ppt-to-video**! 🎉

This document provides guidelines and instructions for contributing.

---

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md) (if available).

---

## 🚀 How to Contribute

There are many ways to contribute:

- 🐛 Report bugs
- 💡 Suggest new features
- 📖 Improve documentation
- 🧑‍💻 Submit pull requests
- ⭐ Star the repository

---

## 📦 Development Setup

### 1. Fork & Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/html-ppt-to-video.git
cd html-ppt-to-video
```

### 2. Install Dependencies

```bash
# Node.js dependencies
npm install

# Python dependencies
pip install -r requirements.txt
```

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

---

## 🧑‍💻 Making Changes

### Code Style

- **JavaScript**: Follow [Standard JS](https://standardjs.com/)
- **Python**: Follow [PEP 8](https://pep8.org/)
- **Markdown**: Use [Prettier](https://prettier.io/)

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new layout generator
fix: resolve animation timing issue
docs: update README with examples
refactor: simplify theme selection logic
test: add unit tests for parse_input.js
```

### Testing

```bash
# Test with example configs
node converters/generate.js --config examples/basic.json --output test-output/

# Validate output
ls test-output/
# Should contain index.html

# Test all examples
for config in examples/*.json; do
  echo "Testing $config..."
  node converters/generate.js --config "$config" --output "test-$(basename $config .json)/"
done
```

---

## 📬 Submitting a Pull Request

### 1. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 2. Open a Pull Request

- Go to https://github.com/qianqiuwanzi/html-ppt-to-video
- Click **"New Pull Request"**
- Select your fork and branch
- Fill in the PR template (see below)

### 3. PR Template

```markdown
## 📋 Description

(Briefly describe your changes)

## 🔗 Related Issues

(Closes #123, Relates to #456)

## 🧪 Testing

(Describe how you tested your changes)

## 📸 Screenshots

(If applicable)

## ✅ Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No console errors/warnings
```

---

## 🐛 Reporting Bugs

### Before Submitting

1. Check [existing issues](https://github.com/qianqiuwanzi/html-ppt-to-video/issues)
2. Update to latest `main` branch
3. Simplify your test case

### Bug Report Template

```markdown
## 🐛 Bug Description

(Clear description of the bug)

## 🔄 Steps to Reproduce

1. Run `node converters/generate.js --config examples/xxx.json`
2. Open `output/index.html`
3. See error in console

## ✅ Expected Behavior

(What should happen)

## ❌ Actual Behavior

(What actually happens)

## 🖥️ Environment

- OS: (Windows/macOS/Linux)
- Node.js version:
- Python version:
- Browser: (if applicable)

## 📎 Additional Context

(Screenshots, logs, etc.)
```

---

## 💡 Suggesting Features

### Feature Request Template

```markdown
## 💡 Feature Description

(Clear description of the proposed feature)

## 🤔 Motivation

(Why is this feature needed?)

## 📐 Proposed Solution

(How should it work?)

## 🔄 Alternatives Considered

(Other approaches you considered)

## 📸 Mockups

(If applicable)
```

---

## 📖 Improving Documentation

Documentation improvements are always welcome!

- Fix typos / grammar
- Add missing examples
- Clarify ambiguous instructions
- Translate to other languages

---

## 🏆 Recognition

Contributors will be:

- Added to [CONTRIBUTORS.md](CONTRIBUTORS.md) (if created)
- Mentioned in release notes
- Forever grateful! 🙏

---

## 📧 Questions?

Feel free to:

- Open a [Discussion](https://github.com/qianqiuwanzi/html-ppt-to-video/discussions)
- Contact the maintainer: [qianqiuwanzi](https://github.com/qianqiuwanzi)

---

**Thank you for contributing to html-ppt-to-video! 🎉**
