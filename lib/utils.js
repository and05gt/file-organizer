export function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

export function drawProgressBar(current, total, width = 20) {
  const percentage = current / total;
  const filled = Math.round(percentage * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

export function updateProgress(prefix, current, total) {
  const bar = drawProgressBar(current, total);
  process.stdout.write(`\r${prefix} ${bar}`);
}

export function clearCurrentLine() {
  process.stdout.write("\r" + " ".repeat(80) + "\r");
}

export function handleFileSystemError(error, targetPath) {
  if (error.code === "ENOENT") {
    console.error(`❌ Error: Directory not found: ${targetPath}`);
  } else if (error.code === "EACCES" || error.code === "EPERM") {
    console.error(`❌ Error: Permission denied: ${targetPath}`);
  } else {
    console.error(`❌ Unexpected error: ${error.message}`);
  }
  process.exit(1);
}
