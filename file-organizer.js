import Scanner from "./lib/scanner.js";
import DuplicateFinder from "./lib/duplicates.js";
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

async function runDuplicates(targetPath) {
  if (!targetPath) {
    console.error('❌ Error: Directory path is required for "duplicates"');
    console.error(
      "Usage: node file-organizer.js duplicates /path/to/directory",
    );
    process.exit(1);
  }

  const finder = new DuplicateFinder();

  finder.on("search-start", (data) => {
    console.log(`🔍 Searching for duplicates in: ${data.directory}`);
  });

  finder.on("file-processed", ({ current, total }) => {
    updateProgress("Calculating hashes...", current, total);
  });

  try {
    const result = await finder.findDuplicates(targetPath);
    clearCurrentLine();

    console.log(
      `\nFound ${result.groups.length} duplicate groups (${formatSize(result.totalWastedSpace)} wasted):\n`,
    );

    result.groups.forEach((group, index) => {
      console.log("━".repeat(34));
      console.log(
        `Group ${index + 1} (${group.files.length} copies, ${formatSize(group.size)} each):`,
      );
      console.log(`  SHA-256: ${group.hash.slice(0, 12)}...`);
      console.log();
      group.files.forEach((file) => {
        console.log(`  📄 ${file}`);
      });
      console.log();
      console.log(`  Wasted space: ${formatSize(group.wastedSpace)}\n`);
    });

    console.log("━".repeat(34));
    console.log(
      `💾 Total wasted space: ${formatSize(result.totalWastedSpace)}`,
    );
  } catch (err) {
    clearCurrentLine();
    handleFileSystemError(err, targetPath);
  }
}

async function main() {
  const [, , command, targetPath] = process.argv;

  switch (command) {
    case "scan":
      await runScan(targetPath);
      break;

    case "duplicates":
      await runDuplicates(targetPath);
      break;

    default:
      console.log("Usage: node file-organizer.js <command> [arguments]");
      console.log("\nAvailable commands:");
      console.log(
        "  scan <dir>                          Recursive scanning and analysis",
      );
      console.log(
        "  duplicates <dir>             Searching for duplicates using SHA-256",
      );
      process.exit(command ? 1 : 0);
  }
}

main();
