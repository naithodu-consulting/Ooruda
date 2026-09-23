import {
  type ExecFileOptions,
  type ExecFileSyncOptions,
  type SpawnOptions,
  execFile,
  execFileSync,
  spawn,
} from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

const rawExecFileAsync = promisify(execFile);

export const IS_WINDOWS = platform() === 'win32';

/**
 * Cross-platform execFile for `.cmd` / `.bat` commands (pnpm, npm, etc.).
 *
 * On Windows, `.cmd`/`.bat` files cannot be executed without a shell
 * (see https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows).
 * Adds `shell: true` + `windowsHide: true` on Windows to resolve them
 * without opening a visible console window.
 *
 * For native executables (git, node, docker) prefer `execFileSync` / `execFile`
 * directly - they don't need a shell.
 */
export function execFileAsync(
  command: string,
  args: string[],
  options: ExecFileOptions = {},
) {
  return rawExecFileAsync(command, args, withShell(options));
}

/**
 * Cross-platform execFileSync.
 */
export function crossExecFileSync(
  command: string,
  args: string[],
  options: ExecFileSyncOptions = {},
) {
  return execFileSync(command, args, withShell(options));
}

/**
 * Spawn a long-running detached process.
 *
 * - **Unix**: uses `detached: true` so the child becomes a process-group
 *   leader (allows group-kill via negative PID).
 * - **Windows**: omits `detached` to avoid opening a visible console window.
 *   The child stays alive as long as the MCP-server process does.
 */
export function spawnDetached(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  const child = spawn(command, args, {
    ...options,
    ...(IS_WINDOWS ? { shell: true, windowsHide: true } : {}),
    detached: !IS_WINDOWS,
    stdio: 'ignore',
  });

  child.unref();
  return child;
}

/**
 * Kill a process (and its tree on Windows).
 *
 * - **Unix**: kills the process group via `process.kill(-pid)`, falling back
 *   to the individual process.
 * - **Windows**: uses `taskkill /T /F /PID` which terminates the whole tree.
 */
export async function killProcess(
  pid: number,
  signal: string = 'SIGTERM',
): Promise<void> {
  if (IS_WINDOWS) {
    try {
      await rawExecFileAsync('taskkill', ['/T', '/F', '/PID', String(pid)], {
        windowsHide: true,
      });
    } catch {
      // Process may already be dead.
    }

    return;
  }

  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already be dead.
    }
  }
}

/**
 * Find which process is listening on a TCP port.
 *
 * - **Unix**: parses `lsof` output.
 * - **Windows**: parses `netstat -ano` output.
 */
export async function getPortProcess(
  port: number,
  cwd: string,
): Promise<{ pid: number; command: string } | null> {
  try {
    if (IS_WINDOWS) {
      return await getPortProcessWindows(port, cwd);
    }

    return await getPortProcessUnix(port, cwd);
  } catch {
    return null;
  }
}

/**
 * Find running processes whose command line matches a pattern.
 *
 * - **Unix**: uses `pgrep -fl`.
 * - **Windows**: uses PowerShell `Get-CimInstance Win32_Process`.
 */
export async function findProcessesByName(
  pattern: string,
  cwd: string,
): Promise<Array<{ pid: number; command: string }>> {
  try {
    if (IS_WINDOWS) {
      return await findProcessesByNameWindows(pattern, cwd);
    }

    return await findProcessesByNameUnix(pattern, cwd);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function withShell<T extends SpawnOptions | ExecFileOptions>(options: T): T {
  if (IS_WINDOWS) {
    return { ...options, shell: true, windowsHide: true };
  }

  return options;
}

async function getPortProcessUnix(port: number, cwd: string) {
  const result = await rawExecFileAsync(
    'lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
    { cwd },
  );

  const lines = result.stdout.split('\n').map((l) => l.trim());
  const pidLine = lines.find((l) => l.startsWith('p'));
  const commandLine = lines.find((l) => l.startsWith('c'));

  if (!pidLine || !commandLine) return null;

  const pid = Number(pidLine.slice(1));

  if (!Number.isFinite(pid)) return null;

  return { pid, command: commandLine.slice(1) };
}

async function getPortProcessWindows(port: number, cwd: string) {
  const result = await rawExecFileAsync('netstat', ['-ano'], {
    cwd,
    windowsHide: true,
  });

  const portStr = `:${port}`;

  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed.includes('LISTENING')) continue;
    if (!trimmed.includes(portStr)) continue;

    // Netstat format: TCP  0.0.0.0:PORT  0.0.0.0:0  LISTENING  PID
    const parts = trimmed.split(/\s+/);
    const pid = Number(parts[parts.length - 1]);

    if (!Number.isFinite(pid) || pid === 0) continue;

    // Verify the port column actually matches (avoid partial matches)
    const localAddr = parts[1] ?? '';

    if (localAddr.endsWith(portStr)) {
      return { pid, command: 'unknown' };
    }
  }

  return null;
}

async function findProcessesByNameUnix(pattern: string, cwd: string) {
  const result = await rawExecFileAsync('pgrep', ['-fl', pattern], { cwd });

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(' ');

      if (spaceIdx <= 0) return null;

      const pid = Number(line.slice(0, spaceIdx));
      const command = line.slice(spaceIdx + 1).trim();

      if (!Number.isFinite(pid)) return null;

      return { pid, command };
    })
    .filter((p): p is { pid: number; command: string } => p !== null);
}

async function findProcessesByNameWindows(pattern: string, cwd: string) {
  // Convert simple regex-like pattern to a PowerShell -match pattern.
  // The patterns used in the codebase (e.g. "stripe.*listen") are already
  // valid PowerShell regex.
  const psCommand = [
    `Get-CimInstance Win32_Process`,
    `| Where-Object { $_.CommandLine -match '${pattern.replace(/'/g, "''")}' }`,
    `| ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }`,
  ].join(' ');

  const result = await rawExecFileAsync(
    'powershell',
    ['-NoProfile', '-Command', psCommand],
    { cwd, windowsHide: true },
  );

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trim();
      const spaceIdx = trimmed.indexOf(' ');

      if (spaceIdx <= 0) return null;

      const pid = Number(trimmed.slice(0, spaceIdx));
      const command = trimmed.slice(spaceIdx + 1).trim();

      if (!Number.isFinite(pid)) return null;

      return { pid, command };
    })
    .filter((p): p is { pid: number; command: string } => p !== null);
}
