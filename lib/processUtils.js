const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

async function getProcesses(options) {
  const { pattern, all, url } = options;

  try {
    let command;

    if (process.platform === "win32") {
      // 使用 PowerShell CIM 以避免 WMIC 在新系统上的缺失/编码问题
      const psSelect = "Select-Object CommandLine,ProcessId,ParentProcessId";
      command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | ${psSelect} | ConvertTo-Json -Compress"`;
    } else if (all) {
      command = `ps -eo pid,ppid,command | grep -v "ps -eo"`;
    } else {
      command = `ps -eo pid,ppid,command | grep -i "${pattern}" | grep -v "grep"`;
    }

    const { stdout } = await execAsync(command);
    const processes = await parseProcessOutput(stdout, process.platform);

    // 非 Windows 平台在命令层已按 pattern 过滤；Windows 在此处按 pattern 过滤
    let filtered = processes;
    if (process.platform === "win32" && !all && pattern) {
      const patternLower = String(pattern).toLowerCase();
      filtered = processes.filter((p) => (p.command || "").toLowerCase().includes(patternLower));
    }

    // 默认不开启URL过滤，除非明确指定了--url
    if (url) {
      return filtered.filter((process) => process.url);
    }

    return filtered;
  } catch (error) {
    throw new Error(`获取进程信息失败: ${error.message}`);
  }
}

async function parseProcessOutput(output, platform) {
  // Windows: 解析 PowerShell JSON
  if (platform === "win32") {
    const trimmed = String(output).trim();
    try {
      const data = JSON.parse(trimmed.length ? trimmed : "null");
      const items = Array.isArray(data) ? data : data ? [data] : [];
      const processes = [];
      for (const item of items) {
        const command = (item.CommandLine || "").toString();
        if (!command) continue;
        const pid = Number(item.ProcessId);
        const ppid = Number(item.ParentProcessId);
        const processInfo = {
          pid: Number.isFinite(pid) ? pid : null,
          ppid: Number.isFinite(ppid) ? ppid : null,
          command,
          url: await extractUrl(command, pid, platform),
          path: extractPath(command),
          isNode: command.toLowerCase().includes("node"),
        };
        processes.push(processInfo);
      }
      return processes;
    } catch (e) {
      // 如果 JSON 解析失败，回退到原 CSV 解析逻辑（兼容极端环境）
      // 下面是原有的 CSV 行处理
    }
  }

  const lines = output
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  const processes = [];

  for (const line of lines) {
    let parts;

    if (platform === "win32") {
      // 回退：WMIC CSV格式解析: Node,CommandLine,ParentProcessId,ProcessId
      parts = line.split(",").map((p) => p.trim());

      // 跳过表头或无效行
      if (parts.length < 4 || parts[0] === "Node" || parts[0] === "") {
        continue;
      }

      const [nodeName, command, ppidStr, pidStr] = parts.slice(-4);

      const pid = parseInt(pidStr, 10);
      const ppid = parseInt(ppidStr, 10);

      if (!command) {
        continue;
      }

      const processInfo = {
        pid: Number.isFinite(pid) ? pid : null,
        ppid: Number.isFinite(ppid) ? ppid : null,
        command,
        url: await extractUrl(command, pid, platform),
        path: extractPath(command),
        isNode: command.toLowerCase().includes("node"),
      };

      processes.push(processInfo);
    } else {
      // Unix格式解析
      parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const command = parts.slice(2).join(" ");

        const processInfo = {
          pid: Number.isFinite(pid) ? pid : null,
          ppid: Number.isFinite(ppid) ? ppid : null,
          command,
          url: await extractUrl(command, pid, platform),
          path: extractPath(command),
          isNode: command.includes("node"),
        };

        processes.push(processInfo);
      }
    }
  }

  return processes;
}

async function extractUrl(command, pid, platform) {
  // 匹配命令行中的端口参数
  const portMatch = command.match(/(?:--port|--listen|-p)\s+(\d+)/);
  if (portMatch) {
    const port = portMatch[1];
    return `http://localhost:${port}`;
  }

  // 匹配命令行中的URL
  const urlMatch = command.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // 匹配Express等框架的默认端口
  const expressMatch = command.match(/express|app\.listen|server\.listen/);
  if (expressMatch) {
    return "http://localhost:3000";
  }

  // 如果是Node.js进程，尝试检查监听的端口
  if (command.toLowerCase().includes("node")) {
    try {
      let lsofCommand;
      if (platform === "win32") {
        // Windows使用netstat
        lsofCommand = `netstat -ano | findstr ${pid} | findstr LISTENING`;
      } else {
        // Unix使用lsof
        lsofCommand = `lsof -i -P -n | grep ${pid} | grep LISTEN`;
      }

      const { stdout } = await execAsync(lsofCommand);
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        let portMatch;
        if (platform === "win32") {
          // Windows netstat格式: TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234
          portMatch = line.match(/:(\d+)\s+.*LISTENING/);
        } else {
          // Unix lsof格式
          portMatch = line.match(/:(\d+)\s+\(LISTEN\)/);
        }
        if (portMatch) {
          const port = portMatch[1];
          return `http://localhost:${port}`;
        }
      }
    } catch (error) {
      // 忽略命令错误
    }
  }

  return null;
}

function tokenizeCommandLineRespectQuotes(command) {
  const tokens = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function stripSurroundingQuotes(str) {
  if (!str) return str;
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.substring(1, str.length - 1);
  }
  return str;
}

function isLikelyNodeExecutable(token) {
  const lower = token.toLowerCase();
  return (
    lower.endsWith("node") ||
    lower.endsWith("node.exe") ||
    lower.includes("\\nodejs\\node.exe") ||
    lower.includes("/node")
  );
}

function isLauncherToken(token) {
  const lower = token.toLowerCase();
  return (
    lower.includes("npm-cli.js") ||
    lower.includes("yarn.js") ||
    lower.includes("pnpm.cjs") ||
    lower.includes("corepack") ||
    /^(npm|yarn|pnpm)(\.cmd)?$/i.test(lower)
  );
}

function isNodeFlag(token) {
  return /^-(-inspect|inspect-brk|r|require|e|p|eval|loader|trace-warnings|trace-deprecation|no-warnings|openssl|dns-result-order|watch)\b/.test(
    token
  );
}

function flagConsumesNextArg(flag) {
  // Flags that are followed by an argument when not passed as --flag=value
  return /^(--require|-r|--loader|--openssl|--dns-result-order)$/.test(flag);
}

function looksLikeFilePath(token) {
  const t = token.replace(/^--?[^=]+=.*/, "");
  return (
    /[\\/]/.test(t) ||
    /\.(js|mjs|cjs|ts|tsx)$/.test(t.toLowerCase())
  );
}

function truncateAfterNodeModules(p) {
  if (!p) return p;
  const idx = p.toLowerCase().indexOf("node_modules");
  if (idx !== -1) {
    return p.substring(0, idx).trim().replace(/[\\/]+$/, "");
  }
  return p;
}

function extractPath(command) {
  const tokens = tokenizeCommandLineRespectQuotes(command);
  if (tokens.length === 0) {
    return null;
  }

  // 1) npm/yarn/pnpm 情况：提取脚本名
  const launcherIdx = tokens.findIndex((t) => isLauncherToken(t));
  if (launcherIdx !== -1) {
    // 形如: node npm-cli.js run dev  或  npm run dev  或  yarn dev
    const after = tokens.slice(launcherIdx + 1).map(stripSurroundingQuotes);
    let script = null;

    const runIdx = after.findIndex((t) => t.toLowerCase() === "run");
    if (runIdx !== -1 && after[runIdx + 1] && !after[runIdx + 1].startsWith("-")) {
      script = after[runIdx + 1];
    } else if (after[0] && !after[0].startsWith("-")) {
      // yarn dev / pnpm dev / npm start
      script = after[0];
    }

    if (script) {
      return script;
    }
    // 若未能提取脚本名，继续后续逻辑
  }

  // 2) Node 直接执行：寻找第一个实际脚本路径，跳过 flags 与内联 -e/-p
  let startIdx = 0;
  const nodeIdx = tokens.findIndex((t) => isLikelyNodeExecutable(stripSurroundingQuotes(t)));
  if (nodeIdx !== -1) {
    startIdx = nodeIdx + 1;
  }

  for (let i = startIdx; i < tokens.length; i++) {
    let tok = stripSurroundingQuotes(tokens[i]);

    if (isNodeFlag(tok)) {
      // 处理 -e/-p（无脚本文件）
      if (/^-(e|p)$/.test(tok) || /^--(eval)$/.test(tok)) {
        return "inline";
      }
      // 某些 flag 会消费下一个参数
      if (!tok.includes("=") && flagConsumesNextArg(tok) && i + 1 < tokens.length) {
        i += 1;
      }
      continue;
    }

    if (isLauncherToken(tok)) {
      // 启动器在此分支出现，尝试后移一位以获取脚本名（已在前面处理过一次）
      continue;
    }

    if (looksLikeFilePath(tok)) {
      return truncateAfterNodeModules(tok);
    }
  }

  // 3) 回退：优先返回 node 后的第一个非 flag 参数，否则返回第一个 token
  if (nodeIdx !== -1) {
    for (let i = nodeIdx + 1; i < tokens.length; i++) {
      const tok = stripSurroundingQuotes(tokens[i]);
      if (!tok.startsWith("-")) {
        return truncateAfterNodeModules(tok);
      }
    }
  }

  return truncateAfterNodeModules(stripSurroundingQuotes(tokens[0]));
}

function formatOutput(processes, options) {
  if (options.json) {
    return JSON.stringify(processes, null, 2);
  }

  if (processes.length === 0) {
    return "没有找到匹配的进程";
  }

  const allPidMissing = processes.every((p) => !Number.isFinite(p.pid));

  let output = "";
  if (allPidMissing) {
    output += "Type\t\tURL\t\t\t\tPath\n";
  } else {
    output += "PID\t\tType\t\tURL\t\t\t\tPath\n";
  }
  output += "─".repeat(80) + "\n";

  for (const process of processes) {
    const type = process.isNode ? "Node.js" : "Other";
    const url = process.url || "None";
    const path = process.path || "None";

    if (allPidMissing) {
      output += `${type}\t\t${url}\t\t${path}\n`;
    } else {
      const pidStr = Number.isFinite(process.pid) ? String(process.pid) : "-";
      output += `${pidStr}\t\t${type}\t\t${url}\t\t${path}\n`;
    }
  }

  return output;
}

module.exports = {
  getProcesses,
  formatOutput,
};
