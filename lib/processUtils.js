const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

async function getProcesses(options) {
  const { pattern, all, url } = options;

  try {
    let command;

    if (all) {
      // Windows和Unix兼容的进程查看命令
      if (process.platform === "win32") {
        command = `wmic process get ProcessId,ParentProcessId,CommandLine /format:csv | findstr /v "Node"`;
      } else {
        command = `ps -eo pid,ppid,command | grep -v "ps -eo"`;
      }
    } else {
      // Windows和Unix兼容的进程过滤
      if (process.platform === "win32") {
        command = `wmic process where "CommandLine like '%${pattern}%'" get ProcessId,ParentProcessId,CommandLine /format:csv`;
      } else {
        command = `ps -eo pid,ppid,command | grep -i "${pattern}" | grep -v "grep"`;
      }
    }

    const { stdout } = await execAsync(command);
    const processes = await parseProcessOutput(stdout, process.platform);

    // 默认不开启URL过滤，除非明确指定了--url
    if (url) {
      return processes.filter((process) => process.url);
    }

    return processes;
  } catch (error) {
    throw new Error(`获取进程信息失败: ${error.message}`);
  }
}

async function parseProcessOutput(output, platform) {
  const lines = output
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  const processes = [];

  for (const line of lines) {
    let parts;

    if (platform === "win32") {
      // Windows CSV格式解析
      parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
        const pid = parts[0];
        const ppid = parts[1];
        const command = parts[2];

        const processInfo = {
          pid: parseInt(pid),
          ppid: parseInt(ppid),
          command,
          url: await extractUrl(command, parseInt(pid), platform),
          path: extractPath(command),
          isNode: command.toLowerCase().includes("node"),
        };

        processes.push(processInfo);
      }
    } else {
      // Unix格式解析
      parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parts[0];
        const ppid = parts[1];
        const command = parts.slice(2).join(" ");

        const processInfo = {
          pid: parseInt(pid),
          ppid: parseInt(ppid),
          command,
          url: await extractUrl(command, parseInt(pid), platform),
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

function extractPath(command) {
  // 先尝试匹配 node 命令后的文件路径
  const nodeMatch = command.match(/node\s+(.+?)(?:\s|$)/);
  if (nodeMatch) {
    let path = nodeMatch[1];
    // 去除 node_modules 之后的部分
    const nodeModulesIndex = path.indexOf("node_modules");
    if (nodeModulesIndex !== -1) {
      path = path.substring(0, nodeModulesIndex).trim();
    }
    return path;
  }

  // 如果没有匹配到 node 命令，则匹配第一个可执行文件路径
  const pathMatch = command.match(/^(\S+)/);
  if (pathMatch) {
    let path = pathMatch[1];
    // 去除 node_modules 之后的部分
    const nodeModulesIndex = path.indexOf("node_modules");
    if (nodeModulesIndex !== -1) {
      path = path.substring(0, nodeModulesIndex).trim();
    }
    return path;
  }

  return null;
}

function formatOutput(processes, options) {
  if (options.json) {
    return JSON.stringify(processes, null, 2);
  }

  if (processes.length === 0) {
    return "没有找到匹配的进程";
  }

  let output = "";
  output += "PID\t\t类型\t\tURL\t\t\t\t路径\n";
  output += "─".repeat(80) + "\n";

  for (const process of processes) {
    const type = process.isNode ? "Node.js" : "其他";
    const url = process.url || "无";
    const path = process.path || "未知";

    output += `${process.pid}\t\t${type}\t\t${url}\t\t${path}\n`;
  }

  return output;
}

module.exports = {
  getProcesses,
  formatOutput,
};
