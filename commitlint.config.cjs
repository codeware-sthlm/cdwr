const { readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const { defaultConfig, RuleConfigSeverity } = require('cz-git');

function findProjectJsonFiles(dir, files = []) {
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      if (
        statSync(fullPath).isDirectory() &&
        !item.startsWith('.') &&
        item !== 'node_modules'
      ) {
        if (item === 'project.json') continue;
        findProjectJsonFiles(fullPath, files);
      } else if (item === 'project.json') {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Skip directories we can't read
  }
  return files;
}

// Resolve scopes from Nx project tags
const scopeSet = new Set();
const projectFiles = findProjectJsonFiles(__dirname);

for (const file of projectFiles) {
  // Skip e2e projects
  if (file.includes('-e2e/')) continue;

  try {
    const content = JSON.parse(readFileSync(file, 'utf-8'));
    if (content.tags) {
      for (const tag of content.tags) {
        if (tag.startsWith('scope:')) {
          scopeSet.add(tag.replace('scope:', ''));
        }
      }
    }
  } catch (e) {
    // Skip invalid JSON files
  }
}

const scopes = Array.from(scopeSet).sort();
// Allow some custom scopes
scopes.push('deps', 'release', 'repo', 'workflow');

/** @type {import('cz-git').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-angular'],
  rules: {
    'scope-enum': [RuleConfigSeverity.Error, 'always', scopes],
    // No AI co-author trailers in this repo's history
    'trailer-exists': [RuleConfigSeverity.Error, 'never', 'Co-Authored-By:'],
    'type-enum': [
      RuleConfigSeverity.Error,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'release'
      ]
    ]
  },
  prompt: {
    allowBreakingChanges: ['feat', 'fix'],
    allowCustomScopes: false,
    allowEmptyScopes: false,
    allowCustomIssuePrefix: false,
    allowEmptyIssuePrefix: false
  },
  messages: {
    ...defaultConfig.messages,
    footer: defaultConfig.messages?.footer?.replace(/#/g, 'COD-')
  }
};
