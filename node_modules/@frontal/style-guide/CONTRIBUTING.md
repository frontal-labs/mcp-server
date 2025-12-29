# Contributing

This project is released under the **Non‑Distributable, Non‑Commercial, Non‑Modifiable Software License** (see the `LICENSE.md` file).  
Contributions are welcome *only* in the form of documentation, translations, bug reports, feature requests, or pull‑requests that the maintainers decide to merge.  
The license prohibits users from redistributing, commercializing, or modifying the distributed binaries, but it does **not** prohibit the maintainers from accepting patches to create new official releases.

## 1. Overview

| Type of Contribution | What you can do | How it fits the license |
|-----------------------|-----------------|--------------------------|
| Bug reports | Open an issue with a reproducible example | Allowed – no code is shared. |
| Feature requests | Suggest an improvement in an issue | Allowed – no code is shared. |
| Documentation / translations | Edit the docs in `docs/` or add a translation file | Allowed – docs are not covered by the “no‑distribution” clause. |
| Code changes | Fork the repo, create a feature branch, run the tests, then open a pull‑request | Allowed **only** if you understand that the final code will be distributed under the same license; the code will **not** be shared separately with anyone else. |

> **Tip:** If you’re unsure whether your contribution is acceptable, open a quick issue first. The maintainers can advise.

## 2. Getting Started

<details>
<summary>Instructions (click to expand)</summary>

1. **Fork & Clone**  
   ```bash
   git clone https://github.com/your-org/style-guide.git
   cd style-guide
   ```

2. **Create a feature branch**  
   ```bash
   git checkout -b your-feature
   ```

3. **Make your changes**  
   * Add unit tests if you touch the logic.  
   * Update documentation if you add a feature or change an existing one.

4. **Run the test suite**  
   ```bash
   make test
   ```

5. **Commit & push**  
   ```bash
   git add .
   git commit -m "feat: add XYZ"
   git push origin your-feature
   ```

6. **Open a Pull Request**  
   * Target branch: `main` (or `develop`, see the repo’s workflow).  
   * Describe the changes, link any related issues, and reference the license (`See LICENSE`).  
   * Optionally add the “Signed‑off‑by” line:  
     ```text
     Signed-off-by: Your Name <you@example.com>
     ```

</details>

## 3. Code of Conduct

We want this project to be a welcoming place for everyone.  
Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) in every interaction—whether you’re opening an issue, reviewing a pull‑request, or writing docs.

## 4. License & Contributor Agreement

When you submit a pull‑request, you implicitly agree that:

1. **Your contribution will be licensed under the same license** that ships the binary (the Non‑Distributable, Non‑Commercial, Non‑Modifiable Software License).  
2. **You will not redistribute the code** on your own, commercialize it, or alter it in a way that would violate that license.  
3. **You grant the maintainers** the right to incorporate, modify, and distribute the final merged code as part of the official build.

If you wish to sign a formal Contributor License Agreement (CLA) for added clarity, let the maintainer know, and we’ll provide the template.

## 5. Testing & Quality

| Tool | Purpose |
|------|---------|
| `make test` | Runs unit tests. |
| `make lint` | Checks coding style. |
| `make docs` | Builds documentation. |

Make sure all checks pass before opening a PR.  
If your change introduces new tests, ensure they all succeed locally.

## 6. Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Pushing directly to `main` | Use a feature branch and open a PR. |
| Committing binary artifacts (e.g., compiled DLLs) | Those should never be pushed; only source files are tracked. |
| Forcing a PR when you haven’t added tests or docs for a code change | Add at least one relevant test or doc update. |
| Forgetting the license disclaimer in a documentation change | Add `© [Year] [Owner] – see LICENSE` at the top of new docs. |

## 7. How the Maintainers Work

1. **Review** – We’ll review your PR within a few days, ask for clarifications if needed.  
2. **Merge** – If the changes pass tests and adhere to the style guide, they’ll be merged into the `main` branch.  
3. **Release** – A new binary will be built and tagged. The source code remains private (or in a controlled repo) so the license stays intact.  

## 8. Need Help?

* **Questions about the license** – Contact the maintainer (`legal@frontal.dev`).  
* **Technical help** – Ask in the issue tracker or Discord/Slack channel (link if available).  
* **Proposing a new feature** – Open an issue first, then a PR.

---

**Thank you for your interest in helping improve this project!**  
We appreciate your time, effort, and respect for the licensing terms.