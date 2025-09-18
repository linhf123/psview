# psview

A cross-platform CLI tool for viewing local process information, specifically displaying PID, service URL, and path for Node.js processes.

## Features

- 🔍 **Intelligent Process Detection**: Displays Node.js processes by default, supports custom mode matching
- 🌐 **Automatic URL Detection**: Intelligently identifies HTTP listening ports and URLs
- 📁 **Path Optimization**: Automatically removes parts after `node_modules` for cleaner display
- 🖥️ **Cross-Platform Support**: Supports Windows, macOS, and Linux
- 📊 **Multiple Output Formats**: Supports table and JSON format output

## Usage

```bash
# Default: Display all Node.js processes
npx psview

# Display processes with URLs only
npx psview --url

# Display all processes
npx psview --all

# Match specific process names
npx psview --pattern python

# JSON format output
npx psview --json

# View help
npx psview --help
```

## Options

- `-p, --pattern <pattern>`: Match process name pattern (default: node)
- `-a, --all`: Display all processes
- `-u, --url`: Display processes with URLs only
- `-j, --json`: Output in JSON format
- `-h, --help`: Display help information

## Platform Compatibility

### Windows
- Uses `wmic` command to get process information
- Uses `netstat` command to check port listening
- Supports Windows 10 and above

### macOS/Linux
- Uses `ps` command to get process information
- Uses `lsof` command to check port listening
- Supports all major Unix systems

## Output Example

```
PID             Type            URL                             Path
──────────────────────────────────────────────────────────────────────────────
96555           Node.js         http://localhost:8001           /path/to/project/
9193            Node.js         http://localhost:16105          /Applications/Visual
```

## License

ISC