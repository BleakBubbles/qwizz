# qwizz

`qwizz` is a dev tool that quizzes you on your code changes. When you make a commit using Git, a webpage will open up with questions that you must answer correctly for the commit to proceed.

## Why

To encourage learning and understanding code in the era of vibe coding.

## Install

First, install in your project as a dev dependency (recommended):

```bash
npm install --save-dev qwizz
```

Then, run the following command to perform setup:

```bash
npx qwizz install
```

And you're all set! Make a commit using Git to see qwizz in action.

## Commands

You can run these additional commands using `npx qwizz <command>`:

- `install` - set up Git hooks for qwizz (uses Husky by default)
- `install [--native]` - set up Git hooks directly
- `gate` - run quiz gating against current staged diff
- `uninstall` - remove qwizz hook integration
- `doctor` - check local setup and dependencies

## Requirements

To use qwizz, you must have:

- Node.js `>=18`
- A git repository
