import Scanner from "./lib/scanner.js";
import {
  formatSize,
  updateProgress,
  clearCurrentLine,
  handleFileSystemError,
} from "./lib/utils.js";

async function runScan(targetPath) {
  if (!targetPath) {
    console.error('❌ Error: Directory path is required for "scan"');
    console.error("Usage: node file-organizer.js scan /path/to/directory");
    process.exit(1);
  }

  const scanner = new Scanner();

  scanner.on("scan-start", (data) => {
    console.log(`📂 Scanning: ${data.directory}`);
  });

  scanner.on("file-found", ({ current, total }) => {
    updateProgress("Processing...", current, total);
  });

  try {
    const stats = await scanner.scan(targetPath);
    clearCurrentLine();

    console.log("\n📊 Scan Results:");
    console.log("━".repeat(34));
    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}\n`);

    console.log("By File Type:");
    const sortedTypes = Array.from(stats.byType.entries()).sort(
      (a, b) => b[1].totalSize - a[1].totalSize,
    );
    for (const [ext, data] of sortedTypes) {
      console.log(
        `  ${ext.padEnd(8)} ${String(data.count).padStart(5)} files   ${formatSize(data.totalSize).padStart(8)}`,
      );
    }

    console.log("\nFile Age:");
    console.log(`  Last 7 days:    ${stats.ageStats.last7Days} files`);
    console.log(`  Last 30 days:   ${stats.ageStats.last30Days} files`);
    console.log(`  Older than 90:  ${stats.ageStats.olderThan90} files`);

    console.log("\nLargest files:");
    stats.largestFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name}\n   ${formatSize(file.size)}`);
    });

    if (stats.oldestFile) {
      console.log(
        `\nOldest file: ${stats.oldestFile.name} (modified ${stats.oldestFile.ageInDays} days ago)`,
      );
    }
  } catch (err) {
    clearCurrentLine();
    handleFileSystemError(err, targetPath);
  }

  scanner.on("scan-complete", (data) => {
    console.log(`Found ${data.totalFiles} files`);
  });
}

async function main() {
  const [, , command, targetPath] = process.argv;

  if (command !== "scan") {
    console.error("❌ Error: Unknown command.");
    console.error("Usage: node file-organizer.js scan /path/to/directory");
    process.exit(1);
  }

  try {
    await runScan(targetPath);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
