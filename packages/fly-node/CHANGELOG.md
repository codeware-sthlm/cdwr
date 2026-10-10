## 0.3.2 (2026-10-10)

### ✨ Features

- **fly-node:** manage an app's public ip addresses ([21d1813e](https://github.com/codeware-sthlm/cdwr/commit/21d1813e))

### 🐞 Bug Fixes

- **fly-node:** machines.restart waits on the machine's state ([07297c53](https://github.com/codeware-sthlm/cdwr/commit/07297c53))
- **repo:** ship the licence in published tarballs ([aea1f581](https://github.com/codeware-sthlm/cdwr/commit/aea1f581))
- **fly-node:** stage every secret a deploy is given ([524abc74](https://github.com/codeware-sthlm/cdwr/commit/524abc74))
- **fly-node:** drop the unsupported confirm flag from ipv6 allocation ([778b3444](https://github.com/codeware-sthlm/cdwr/commit/778b3444))

### ⚙️ Miscellaneous Chores

- **repo:** platform under FSL-1.1-MIT, npm packages stay MIT ([ce949b26](https://github.com/codeware-sthlm/cdwr/commit/ce949b26))

## 0.3.1 (2026-08-25)

### ✨ Features

- **app-cms:** show the certificates Fly issued for a domain ([c7983c5d](https://github.com/codeware-sthlm/cdwr/commit/c7983c5d))
- **fly-node:** restart app machines over the rest api ([3367b887](https://github.com/codeware-sthlm/cdwr/commit/3367b887))
- **fly-node:** expose the graphql client as its own entry point ([52db8c26](https://github.com/codeware-sthlm/cdwr/commit/52db8c26))
- **fly-node:** manage certificates over the graphql api ([15c0b89c](https://github.com/codeware-sthlm/cdwr/commit/15c0b89c))
- **fly-node:** add ssh exec to run commands in a machine ([ba3ee3c6](https://github.com/codeware-sthlm/cdwr/commit/ba3ee3c6))
- **fly-node:** add build response schema and export missing types ([73ce64e8](https://github.com/codeware-sthlm/cdwr/commit/73ce64e8))
- **fly-node:** add machine management methods ([dbdf0f54](https://github.com/codeware-sthlm/cdwr/commit/dbdf0f54))
- **repo:** shared preview database ([f48d959e](https://github.com/codeware-sthlm/cdwr/commit/f48d959e))
- **fly-node:** add option to stream to console ([1bb02e33](https://github.com/codeware-sthlm/cdwr/commit/1bb02e33))
- **fly-node:** support build arguments in deploy command ([dfa1736a](https://github.com/codeware-sthlm/cdwr/commit/dfa1736a))

### 🐞 Bug Fixes

- **app-cms:** show fly's own prose for a failed certificate check ([3c047d0c](https://github.com/codeware-sthlm/cdwr/commit/3c047d0c))
- **fly-node:** match config save to fly's real api ([6af2597c](https://github.com/codeware-sthlm/cdwr/commit/6af2597c))
- **fly-node:** pin flyctl to one file ci and local both read ([c18203bf](https://github.com/codeware-sthlm/cdwr/commit/c18203bf))
- **fly-node:** match certificate check and add to fly's real api ([020b06a8](https://github.com/codeware-sthlm/cdwr/commit/020b06a8))
- **fly-node:** treat a missing certificate as an answer, not a fault ([75714e87](https://github.com/codeware-sthlm/cdwr/commit/75714e87))
- **repo:** import defineConfig from vitest/config in test configs ([69a6d471](https://github.com/codeware-sthlm/cdwr/commit/69a6d471))
- **core:** split vitest-only exports into separate entry point ([489f297a](https://github.com/codeware-sthlm/cdwr/commit/489f297a))
- **fly-node:** add machines.update for per-machine config updates ([a5498c8e](https://github.com/codeware-sthlm/cdwr/commit/a5498c8e))

### 🧹 Code Refactoring

- **repo:** split @cdwr/core into shared util libs ([797f20d0](https://github.com/codeware-sthlm/cdwr/commit/797f20d0))

### 📄 Documentation

- **fly-node:** document machine restarts in the FlyApi readme ([7030a6ac](https://github.com/codeware-sthlm/cdwr/commit/7030a6ac))
- **fly-node:** update README with machine methods ([57cfce9c](https://github.com/codeware-sthlm/cdwr/commit/57cfce9c))

### ⚙️ Miscellaneous Chores

- repoint repo urls to codeware-sthlm/cdwr ([969d3614](https://github.com/codeware-sthlm/cdwr/commit/969d3614))
- migrate to nx 23.1.0 ([1fd45d5b](https://github.com/codeware-sthlm/cdwr/commit/1fd45d5b))

### ✅ Tests

- **fly-node:** cover the graphql client with fixtures and a drift check ([eef458aa](https://github.com/codeware-sthlm/cdwr/commit/eef458aa))

## 0.3.0 (2026-01-02)

### ✨ Features

- **fly-node:** redact secrets for trace cli ([d980611](https://github.com/codeware-sthlm/codeware/commit/d980611))
- **fly-node:** add integration tests and fix mismatched schemas ([a2eb288](https://github.com/codeware-sthlm/codeware/commit/a2eb288))

### 🐞 Bug Fixes

- **fly-node:** do not rely on access-token for authentication ([1a46ea0](https://github.com/codeware-sthlm/codeware/commit/1a46ea0))

### 🧱 Updated Dependencies

- Updated core to 1.4.4

## 0.2.3 (2025-12-01)

### 🧱 Updated Dependencies

- Updated core to 1.4.3

## 0.2.2 (2025-10-03)

### ⚙️ Miscellaneous Chores

- **repo:** fix vite name conflicts ([624d9eb](https://github.com/codeware-sthlm/codeware/commit/624d9eb))
- **repo:** migrate to eslint esm ([6581a92](https://github.com/codeware-sthlm/codeware/commit/6581a92))

### 🧱 Updated Dependencies

- Updated core to 1.4.2

## 0.2.1 (2025-02-07)

### 🐞 Bug Fixes

- **web:** remove dependency to payload and related packages ([0a7a63e](https://github.com/codeware-sthlm/codeware/commit/0a7a63e))

## 0.2.0 (2025-01-30)

### ✨ Features

- **fly-node:** optional opt out depot builder on deploy ([5bd15a0e1](https://github.com/codeware-sthlm/codeware/commit/5bd15a0e1))

### 🐞 Bug Fixes

- **fly-node:** fix fly deploy command typo ([fa79f4daf](https://github.com/codeware-sthlm/codeware/commit/fa79f4daf))
- **fly-node:** use spawn pty for interactive prompts ([3998bc606](https://github.com/codeware-sthlm/codeware/commit/3998bc606))
- **fly-node:** detach postgres must handle interactive prompt ([6e2c79036](https://github.com/codeware-sthlm/codeware/commit/6e2c79036))

## 0.1.0 (2025-01-12)

### ✨ Features

- **fly-node:** support attach and detach postgres cluster ([1e5b749](https://github.com/codeware-sthlm/codeware/commit/1e5b749))
- **fly-node:** add support for environment variables in deploy ([8af48bc](https://github.com/codeware-sthlm/codeware/commit/8af48bc))
- **fly-node:** add fly cli node wrapper package ([aaab584](https://github.com/codeware-sthlm/codeware/commit/aaab584))

### 🐞 Bug Fixes

- **fly-node:** postgres detach has no yes flag ([bb9a482](https://github.com/codeware-sthlm/codeware/commit/bb9a482))

### ⚙️ Miscellaneous Chores

- **repo:** fix nx project dependencies ([383f50e](https://github.com/codeware-sthlm/codeware/commit/383f50e))