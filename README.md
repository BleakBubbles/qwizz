# qwizz

`qwizz` is a dev tool that quizzes you on your code changes. When you make a commit using git, a webpage will open up with questions that you must answer correctly for the commit to proceed.

## Why

To encourage learning and understanding code in the vibe coding era.

## Install

Install in your project (recommended):

```bash
npm install --save-dev qwizz
```

Then, run this to set it up:

```bash
npx qwizz install
```

## Commands

- `install [--native]` - install qwizz into your git hook flow
- `gate` - run quiz gating against current staged diff
- `uninstall` - remove qwizz hook integration
- `doctor` - check local setup and dependencies

## Requirements

- Node.js `>=18`
- A git repository
