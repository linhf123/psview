[English Version](README-EN.md)

# psview

一个跨平台的 CLI 工具，用于查看本地进程信息，特别是显示 Node.js 进程的 PID、服务 URL 和路径。

## 功能

- 🔍 **智能进程检测**：默认显示 Node.js 进程，支持自定义模式匹配
- 🌐 **自动 URL 检测**：智能识别 HTTP 监听端口和 URL
- 📁 **路径优化**：自动移除 `node_modules` 之后的部分以获得更简洁的显示
- 🖥️ **跨平台支持**：支持 Windows、macOS 和 Linux
- 📊 **多种输出格式**：支持表格和 JSON 格式输出

## 使用方法

```bash
# 默认：显示所有 Node.js 进程
npx psview

# 仅显示带有 URL 的进程
npx psview --url

# 显示所有进程
npx psview --all

# 匹配特定进程名称
npx psview --pattern python

# JSON 格式输出
npx psview --json

# 查看帮助
npx psview --help
```

## 选项

- `-p, --pattern <pattern>`：匹配进程名称模式（默认：node）
- `-a, --all`：显示所有进程
- `-u, --url`：仅显示带有 URL 的进程
- `-j, --json`：以 JSON 格式输出
- `-h, --help`：显示帮助信息

## 平台兼容性

### Windows

- 使用 `wmic` 命令获取进程信息
- 使用 `netstat` 命令检查端口监听
- 支持 Windows 10 及以上版本

### macOS/Linux

- 使用 `ps` 命令获取进程信息
- 使用 `lsof` 命令检查端口监听
- 支持所有主要的 Unix 系统

## 输出示例

```
PID             Type            URL                             Path
──────────────────────────────────────────────────────────────────────────────
96555           Node.js         http://localhost:8001           /path/to/project/
9193            Node.js         http://localhost:16105          /Applications/Visual
```

## 许可证

ISC
