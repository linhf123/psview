#!/usr/bin/env node

const { Command } = require('commander');
const { getProcesses, formatOutput } = require('../lib/processUtils');

const program = new Command();

program
  .name('psview')
  .description('查看本地进程信息，默认显示Node.js进程的PID、服务URL和路径')
  .version('1.0.0')
  .option('-p, --pattern <pattern>', '匹配进程名称模式', 'node')
  .option('-a, --all', '显示所有进程')
  .option('-u, --url', '只显示有URL的进程')
  .option('-j, --json', '以JSON格式输出')
  .action(async (options) => {
    try {
      const processes = await getProcesses(options);
      const output = formatOutput(processes, options);
      console.log(output);
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

program.parse();