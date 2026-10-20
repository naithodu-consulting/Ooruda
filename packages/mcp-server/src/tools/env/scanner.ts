import { envVariables } from './model';
import {
  AppEnvState,
  EnvFileInfo,
  EnvMode,
  EnvVariableState,
  ScanFs,
  ScanOptions,
} from './types';

import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';

// Define precedence order for each mode
const ENV_FILE_PRECEDENCE: Record<EnvMode, string[]> = {
  development: [
    '.env',
    '.env.development',
    '.env.local',
    '.env.development.local',
  ],
  production: [
    '.env',
    '.env.production',
    '.env.local',
    '.env.production.local',
  ],
};

function getSourcePrecedence(source: string, mode: EnvMode): number {
  return ENV_FILE_PRECEDENCE[mode].indexOf(source);
}

export async function scanMonorepoEnv(
  options: ScanOptions,
): Promise<EnvFileInfo[]> {
  const {
    rootDir = findWorkspaceRoot(process.cwd()),
    apps = ['web'],
    mode,
  } = options;

  const defaultFs: ScanFs = {
    readFile: (filePath) => fs.readFile(filePath, 'utf-8'),
    readdir: (dirPath) => fs.readdir(dirPath),
    stat: (path) => fs.stat(path),
  };
  const fsApi = options.fs ?? defaultFs;

  const envTypes = ENV_FILE_PRECEDENCE[mode];
  const appsDir = path.join(rootDir, 'apps');
  const results: EnvFileInfo[] = [];

  try {
    const appDirs = await fsApi.readdir(appsDir);

    for (const appName of appDirs) {
      if (apps.length > 0 && !apps.includes(appName)) {
        continue;
      }

      const appDir = path.join(appsDir, appName);
      const stat = await fsApi.stat(appDir);

      if (!stat.isDirectory()) {
        continue;
      }

      const appInfo: EnvFileInfo = {
        appName,
        filePath: appDir,
        variables: [],
      };

      for (const envType of envTypes) {
        const envPath = path.join(appDir, envType);

        try {
          const content = await fsApi.readFile(envPath);
          const vars = parseEnvFile(content, envType);

          appInfo.variables.push(...vars);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn(`Error reading ${envPath}:`, error);
          }
        }
      }

      results.push(appInfo);
    }
  } catch (error) {
    console.error('Error scanning monorepo:', error);
    throw error;
  }

  return results;
}

function parseEnvFile(content: string, source: string) {
  const variables: Array<{ key: string; value: string; source: string }> = [];

  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) {
      continue;
    }

    // Match KEY=VALUE pattern, handling quotes
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key = '', rawValue] = match;
      let value = rawValue ?? '';

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Handle escaped quotes within the value
      value = value
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');

      variables.push({
        key: key.trim(),
        value: value.trim(),
        source,
      });
    }
  }

  return variables;
}

export function processEnvDefinitions(
  envInfo: EnvFileInfo,
  mode: EnvMode,
): AppEnvState {
  const variableMap: Record<string, EnvVariableState> = {};

  // First pass: Collect all definitions
  for (const variable of envInfo.variables) {
    if (!variable) {
      continue;
    }

    const model = envVariables.find((v) => variable.key === v.name);

    if (!variableMap[variable.key]) {
      variableMap[variable.key] = {
        key: variable.key,
        isVisible: true,
        definitions: [],
        effectiveValue: variable.value,
        effectiveSource: variable.source,
        isOverridden: false,
        category: model ? model.category : 'Custom',
        validation: {
          success: true,
          error: {
            issues: [],
          },
        },
      };
    }

    const varState = variableMap[variable.key];

    if (!varState) {
      continue;
    }

    varState.definitions.push({
      key: variable.key,
      value: variable.value,
      source: variable.source,
    });
  }

  // Second pass: Determine effective values and override status
  for (const key in variableMap) {
    const varState = variableMap[key];

    if (!varState) {
      continue;
    }

    // Sort definitions by mode-specific precedence
    varState.definitions.sort(
      (a, b) =>
        getSourcePrecedence(a.source, mode) -
        getSourcePrecedence(b.source, mode),
    );

    if (varState.definitions.length > 1) {
      const lastDef = varState.definitions[varState.definitions.length - 1];

      if (!lastDef) {
        continue;
      }

      const highestPrecedence = getSourcePrecedence(lastDef.source, mode);

      varState.isOverridden = true;
      varState.effectiveValue = lastDef.value;
      varState.effectiveSource = lastDef.source;

      // Check for conflicts at highest precedence
      const conflictingDefs = varState.definitions.filter(
        (def) => getSourcePrecedence(def.source, mode) === highestPrecedence,
      );

      if (conflictingDefs.length > 1) {
        varState.effectiveSource = `${varState.effectiveSource} (conflict)`;
      }
    }
  }

  // Build a lookup of all effective values once (used by validations below)
  const allVariables: Record<string, string> = {};

  for (const key in variableMap) {
    const varState = variableMap[key];
    if (varState) {
      allVariables[varState.key] = varState.effectiveValue;
    }
  }

  // after computing the effective values, we can check for errors
  for (const key in variableMap) {
    const model = envVariables.find((v) => key === v.name);
    const varState = variableMap[key];

    if (!varState) {
      continue;
    }

    let validation: {
      success: boolean;
      error: {
        issues: string[];
      };
    } = { success: true, error: { issues: [] } };

    if (model) {
      // First check if it's required but missing (use pre-computed allVariables)
      if (model.required && !varState.effectiveValue) {
        validation = {
          success: false,
          error: {
            issues: [
              `This variable is required but missing from your environment files`,
            ],
          },
        };
      } else if (model.contextualValidation) {
        // Then check contextual validation
        const dependenciesMet = model.contextualValidation.dependencies.some(
          (dep) => {
            const dependencyValue = allVariables[dep.variable] ?? '';

            return dep.condition(dependencyValue, allVariables);
          },
        );

        if (dependenciesMet) {
          // Only check for missing value or run validation if dependencies are met
          if (!varState.effectiveValue) {
            const dependencyErrors = model.contextualValidation.dependencies
              .map((dep) => {
                const dependencyValue = allVariables[dep.variable] ?? '';

                const shouldValidate = dep.condition(
                  dependencyValue,
                  allVariables,
                );

                if (shouldValidate) {
                  const { success } = model.contextualValidation!.validate({
                    value: varState.effectiveValue,
                    variables: allVariables,
                    mode,
                  });

                  if (success) {
                    return null;
                  }

                  return dep.message;
                }

                return null;
              })
              .filter((message): message is string => message !== null);

            validation = {
              success: dependencyErrors.length === 0,
              error: {
                issues: dependencyErrors
                  .map((message) => message)
                  .filter((message) => !!message),
              },
            };
          } else {
            // If we have a value and dependencies are met, run contextual validation
            const result = model.contextualValidation.validate({
              value: varState.effectiveValue,
              variables: allVariables,
              mode,
            });

            if (!result.success) {
              validation = {
                success: false,
                error: {
                  issues: result.error.issues
                    .map((issue) => issue.message)
                    .filter((message) => !!message),
                },
              };
            }
          }
        }
      } else if (model.validate && varState.effectiveValue) {
        // Only run regular validation if:
        // 1. There's no contextual validation
        // 2. There's a value to validate
        const result = model.validate({
          value: varState.effectiveValue,
          variables: allVariables,
          mode,
        });

        if (!result.success) {
          validation = {
            success: false,
            error: {
              issues: result.error.issues
                .map((issue) => issue.message)
                .filter((message) => !!message),
            },
          };
        }
      }
    }

    varState.validation = validation;
  }

  // Final pass: Validate missing variables that are marked as required
  // or as having contextual validation
  for (const model of envVariables) {
    // If the variable exists in appState, use that
    const existingVar = variableMap[model.name];

    if (existingVar) {
      // If the variable is already in the map, skip it
      continue;
    }

    if (model.contextualValidation) {
      // Check if any dependency condition is met for this missing variable
      const errors = model.contextualValidation.dependencies.flatMap((dep) => {
        const dependencyValue = allVariables[dep.variable] ?? '';
        const shouldValidate = dep.condition(dependencyValue, allVariables);

        if (!shouldValidate) {
          return [];
        }

        // Validate with the missing variable's empty value
        const validation = model.contextualValidation!.validate({
          value: '',
          variables: allVariables,
          mode,
        });

        if (!validation.success) {
          return [dep.message];
        }

        return [];
      });

      if (errors.length === 0) {
        continue;
      }

      variableMap[model.name] = {
        key: model.name,
        effectiveValue: '',
        effectiveSource: 'MISSING',
        isVisible: true,
        category: model.category,
        isOverridden: false,
        definitions: [],
        validation: {
          success: false,
          error: {
            issues: errors,
          },
        },
      };
    } else if (model.required) {
      // Required but no contextual validation - generic required error
      variableMap[model.name] = {
        key: model.name,
        effectiveValue: '',
        effectiveSource: 'MISSING',
        isVisible: true,
        category: model.category,
        isOverridden: false,
        definitions: [],
        validation: {
          success: false,
          error: {
            issues: [
              `This variable is required but missing from your environment files`,
            ],
          },
        },
      };
    }
  }

  return {
    appName: envInfo.appName,
    filePath: envInfo.filePath,
    mode,
    variables: variableMap,
  };
}

export async function getEnvState(
  options: ScanOptions,
): Promise<AppEnvState[]> {
  const envInfos = await scanMonorepoEnv(options);
  return envInfos.map((info) => processEnvDefinitions(info, options.mode));
}

export async function getVariable(key: string, mode: EnvMode) {
  // Get the processed environment state for all apps (you can limit to 'web' via options)
  const envStates = await getEnvState({ mode, apps: ['web'] });

  // Find the state for the "web" app.
  const webState = envStates.find((state) => state.appName === 'web');

  // Return the effectiveValue based on override status.
  return webState?.variables[key]?.effectiveValue ?? '';
}

export function findWorkspaceRoot(startPath: string) {
  let current = startPath;

  for (let depth = 0; depth < 6; depth++) {
    const maybeWorkspace = path.join(current, 'pnpm-workspace.yaml');

    if (existsSync(maybeWorkspace)) {
      return current;
    }

    const parent = path.join(current, '..');

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return startPath;
}
