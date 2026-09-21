<p align="center">
  <br />
  <img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" height="140" />
  <br />
  <br />
</p>

<h1 align='center'>@cdwr/nx-ai</h1>

<p align='center'>
  AI-powered code analysis for your <a href='https://nx.dev'>Nx</a> workspace projects, powered by <a href='https://www.anthropic.com'>Claude</a>.
  <br />
  <br />
  <a href='https://www.npmjs.com/package/@cdwr/nx-ai'><img src='https://img.shields.io/npm/v/@cdwr/nx-ai?label=npm%20version' alt='@cdwr/nx-ai npm'></a>
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Contents <!-- omit in toc -->

- [Why this plugin exists](#why-this-plugin-exists)
- [Design philosophy](#design-philosophy)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Setup](#setup)
- [Usage](#usage)
  - [Add the analyzer to a project](#add-the-analyzer-to-a-project)
  - [Run an analysis](#run-an-analysis)
  - [Analysis categories](#analysis-categories)
  - [Executor options](#executor-options)
- [Plugin Generators](#plugin-generators)
- [Limitations](#limitations)

## Why this plugin exists

Code review tooling usually lives outside your Nx workspace and lacks awareness of your project graph.

This plugin brings AI-assisted code analysis directly into Nx as a first-class executor — allowing you to analyze individual projects using the same commands, targets, and workflows you already use.

It sends your project's TypeScript source files to Claude API and returns structured, category-grouped feedback on architecture, typing, maintainability, and refactoring opportunities. No external CI integration required. Run it locally whenever you need a second opinion.

## Design philosophy

- **Local-first** — run analysis directly in your workspace, no CI required
- **Bounded context** — limits file count to keep cost predictable
- **Nx-native** — integrates with targets, generators, and project graph
- **Advisory only** — provides feedback, does not modify code

## Prerequisites

- An existing Nx workspace
- Node 20+
- An [Anthropic API key](https://console.anthropic.com/)

> [!TIP]
> The commands in this readme assume that Nx is installed globally.
>
> ```sh
> nx [...]
> ```
>
> If you prefer not to, prefix commands with your package manager:
>
> ```sh
> npx nx [...]
> # pnpm
> pnpm nx [...]
> ```

## Installation

Add the plugin to your workspace. This installs `@cdwr/nx-ai` and its required peer dependency `@anthropic-ai/sdk`.

```sh
nx add @cdwr/nx-ai
```

## Setup

### Anthropic API key <!-- omit in toc -->

The `analyze` executor requires an `ANTHROPIC_API_KEY` environment variable to be set.

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

For persistent local development, add it to your shell profile or a `.env` file that is loaded before running Nx targets. Make sure `.env` files containing secrets are listed in `.gitignore`.

> [!IMPORTANT]
> Never commit your API key to source control.

## Usage

### Add the analyzer to a project

Use the `add` generator to wire up the `analyze` executor for a specific project. This adds an `analyze` target to the project's `project.json`.

```sh
nx g @cdwr/nx-ai:add --project=my-lib
```

With a custom target name:

```sh
nx g @cdwr/nx-ai:add --project=my-lib --targetName=ai-review
```

The resulting target in `project.json` looks like:

```json
{
  "targets": {
    "analyze": {
      "executor": "@cdwr/nx-ai:analyze"
    }
  }
}
```

Executor options can be set directly on the target or passed as flags at runtime — see [Executor options](#executor-options).

### Run an analysis

Once the target is wired up, run it:

```sh
nx run my-lib:analyze
```

The executor:

1. Collects a prioritized subset of TypeScript source files from the project
2. Optionally includes files from internal dependencies
3. Sends the code to Claude for analysis
4. Outputs structured feedback in the terminal and optionally writes a markdown report

Example with options:

```sh
# Focus on typing and maintainability only, include files from dependencies
nx run my-lib:analyze --focus=typing,maintainability --includeDeps

# Use a specific model and raise the file limit
nx run my-lib:analyze --model=claude-opus-4-6 --maxFiles=40

# Show only a summary in terminal
nx run my-lib:analyze --format=summary

# Save full report to file
nx run my-lib:analyze --outputFile=tmp/ai-reports/my-lib.md

# Combine both
nx run my-lib:analyze --format=summary --outputFile=tmp/ai-reports/my-lib.md
```

### Analysis categories

The executor analyses code across four categories. Use the `focus` option to limit to a subset.

| Category          | What it covers                                                                         |
| ----------------- | -------------------------------------------------------------------------------------- |
| `architecture`    | Module boundaries, separation of concerns, dependency direction, cohesion and coupling |
| `typing`          | Type coverage, use of `any`, overly broad types, missing generics, type assertions     |
| `maintainability` | Naming clarity, comment quality, complexity, testability                               |
| `refactoring`     | Duplication, dead code, oversized functions or files, simplification opportunities     |

### Executor options

Options can be configured in `project.json` under the target or passed as CLI flags.

| Option        | Type       | Default             | Description                                                                                  |
| ------------- | ---------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `maxFiles`    | `number`   | `20`                | Maximum number of source files to include from the project.                                  |
| `includeDeps` | `boolean`  | `false`             | Also include source files from internal project dependencies (up to 3 projects).             |
| `focus`       | `string[]` | _(all categories)_  | Subset of categories to analyze: `architecture`, `typing`, `maintainability`, `refactoring`. |
| `model`       | `string`   | `claude-sonnet-4-6` | Claude model identifier to use.                                                              |
| `format`      | `string`   | `"full"`            | Terminal output format: `full` or `summary`.                                                 |
| `outputFile`  | `string`   |                     | Write the full markdown analysis report to a file.                                           |

Setting options in `project.json`:

```json
{
  "targets": {
    "analyze": {
      "executor": "@cdwr/nx-ai:analyze",
      "options": {
        "maxFiles": 30,
        "focus": ["architecture", "refactoring"]
      }
    }
  }
}
```

## Plugin Generators

### `add` <!-- omit in toc -->

Add the `@cdwr/nx-ai` plugin to a project by wiring up the analyze executor.

```sh
nx g @cdwr/nx-ai:add
```

| Option       | Type      | Required | Default     | Description                                     |
| ------------ | --------- | :------: | ----------- | ----------------------------------------------- |
| `project`    | `string`  |    ✅    |             | The name of the project to add the analyzer to. |
| `targetName` | `string`  |          | `"analyze"` | Name of the target to add to the project.       |
| `skipFormat` | `boolean` |          | `false`     | Skip formatting files after generation.         |

### `init` _(internal)_ <!-- omit in toc -->

Initialize the `@cdwr/nx-ai` plugin. Adds `@anthropic-ai/sdk` to the workspace dev dependencies. Called automatically by `nx add` and the `add` generator — you do not need to run this directly.

## Limitations

- **TypeScript only** — the executor collects `.ts` and `.tsx` files. Other file types are ignored.
- **Heuristic file selection** — only a subset of files are analyzed (based on priority and limits), so results are indicative rather than exhaustive.
- **File cap** — analysis is limited to `maxFiles` files per run (default 20) to keep API costs predictable. Entry points and files under `src/` are prioritized.
- **File size cap** — individual files are truncated at 3000 characters when sent to the API.
- **Dependency depth** — `includeDeps` reaches one level of internal dependencies (up to 3 projects) and shares the same file cap.
- **No caching** — analysis results are not cached by Nx because the output depends on external API state. Each run calls the Claude API and incurs cost.
- **No automated fixes** — the executor outputs textual feedback only. It does not modify any files.
- **API key required** — there is no offline or mock mode.
