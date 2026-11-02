import path from "node:path";
import Scanner from "./lib/scanner.js";
import DuplicateFinder from "./lib/duplicates.js";
import Organizer from "./lib/organizer.js";
import Cleanup from "./lib/cleanup.js";

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

function drawProgressBar(current, total, width = 20) {
  const percentage = current / total;
  const filled = Math.round(percentage * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

function updateProgress(prefix, current, total) {
  const bar = drawProgressBar(current, total);
  process.stdout.write(`\r${prefix} ${bar}`);
}

function handleFileSystemError(error, targetPath) {
  if (error.code === "ENOENT") {
    console.error(`❌ Error: Directory not found: ${targetPath}`);
  } else if (error.code === "EACCES" || error.code === "EPERM") {
    console.error(`❌ Error: Permission denied: ${targetPath}`);
  } else if (error.code === "ENOSPC") {
    console.error(`❌ Error: No space left on device: ${targetPath}`);
  } else {
    console.error(`❌ Unexpected error: ${error.message}`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const command = args[0];
  const positionals = [];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("--")) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command, positionals, options };
}

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

  scanner.on("file-error", ({ file, error }) => {
    process.stdout.write(`\n⚠️  Skipped "${file}": ${error.message}\n`);
  });

  try {
    const stats = await scanner.scan(targetPath);
    console.log("\n");

    console.log("📊 Scan Results:");
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
    console.log();
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

  finder.on("file-error", ({ file, error }) => {
    process.stdout.write(`\n⚠️  Skipped "${file}": ${error.message}\n`);
  });

  try {
    const result = await finder.findDuplicates(targetPath);
    console.log("\n");

    console.log(
      `Found ${result.groups.length} duplicate groups (${formatSize(result.totalWastedSpace)} wasted):\n`,
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
    console.log();
    handleFileSystemError(err, targetPath);
  }
}

async function runOrganize(sourcePath, targetPath) {
  if (!sourcePath || !targetPath) {
    console.error(
      "❌ Error: Both source and --output target paths are required.",
    );
    console.error(
      "Usage: node file-organizer.js organize /source/directory --output /target/directory",
    );
    process.exit(1);
  }

  const organizer = new Organizer();

  organizer.on("organize-start", (data) => {
    console.log(`📦 Organizing: ${data.source}`);
    console.log(`Target: ${data.target}\n`);
  });

  organizer.on("directories-created", (categories) => {
    console.log("Creating folders...");
    categories.forEach((category) => console.log(`  ✓ ${category}/`));
    console.log();
  });

  organizer.on("copy-complete", ({ current, total }) => {
    updateProgress("Copying files...", current, total);
  });

  organizer.on("copy-error", ({ file, error }) => {
    process.stdout.write(`\n⚠️  Failed to copy "${file}": ${error.message}\n`);
  });

  try {
    const stats = await organizer.organize(sourcePath, targetPath);
    console.log("\n");

    const lastFolder = path.basename(path.resolve(targetPath));

    console.log("✅ Organization complete!");
    console.log("\nSummary:");
    for (const [category, count] of Object.entries(stats.byCategory)) {
      console.log(
        `  ${(category + ":").padEnd(10)} ${String(count).padStart(4)} files → ${lastFolder}/${category}/`,
      );
    }
    console.log(
      `\nTotal copied: ${stats.totalCopied} files (${formatSize(stats.totalBytes)})`,
    );
  } catch (err) {
    console.log();
    handleFileSystemError(err, sourcePath);
  }
}

async function runCleanup(targetPath, olderThanArg, isConfirm) {
  if (!targetPath) {
    console.error('❌ Error: Directory path is required for "cleanup"');
    console.error(
      "Usage: node file-organizer.js cleanup /path/to/directory --older-than 90 [--confirm]",
    );
    process.exit(1);
  }

  const daysThreshold = parseInt(olderThanArg, 10);
  if (isNaN(daysThreshold) || daysThreshold < 0) {
    console.error(
      "❌ Error: Please specify valid days count via --older-than <number>",
    );
    process.exit(1);
  }

  const cleanup = new Cleanup();
  const foundFiles = [];

  cleanup.once("cleanup-start", (data) => {
    console.log(`🧹 Cleanup: ${data.directory}`);
    console.log(`Looking for files older than ${data.daysThreshold} days...\n`);
  });

  cleanup.on("file-found", (file) => {
    foundFiles.push(file);
  });

  cleanup.on("file-error", ({ file, error }) => {
    process.stdout.write(`\n⚠️  Skipped "${file}": ${error.message}\n`);
  });

  cleanup.on("file-deleted", ({ current, total }) => {
    updateProgress("Deleting...", current, total);
  });

  cleanup.on("delete-error", ({ file, error }) => {
    console.error(`\n⚠️  Could not delete ${file}: ${error.message}`);
  });

  try {
    const initialScan = await cleanup.cleanup(targetPath, daysThreshold, false);

    if (initialScan.totalFiles === 0) {
      console.log(
        "No files found matching the age criteria. Nothing to delete.",
      );
      return;
    }

    console.log(`Found ${initialScan.totalFiles} files to delete:\n`);
    console.log("━".repeat(34));

    const previewFiles = initialScan.files.slice(0, 3);
    previewFiles.forEach((file) => {
      console.log(file.name);
      console.log(`  Size: ${formatSize(file.size)}`);
      console.log(
        `  Modified: ${file.daysOld} days ago (${file.dateFormatted})\n`,
      );
    });

    if (initialScan.files.length > 3) {
      console.log(`... (${initialScan.files.length - 3} more files)`);
    }

    console.log("━".repeat(34));
    console.log();
    console.log(
      `Total: ${initialScan.totalFiles} files (${formatSize(initialScan.totalBytes)})\n`,
    );

    if (!isConfirm) {
      console.log("⚠️  DRY RUN MODE: No files were deleted.");
      console.log("To actually delete these files, run with --confirm flag.");
      return;
    }

    console.log(
      `⚠️  DELETING ${initialScan.totalFiles} files (${formatSize(initialScan.totalBytes)}). This action cannot be undone!\n`,
    );

    const deleteResult = await cleanup.cleanup(targetPath, daysThreshold, true);
    console.log("\n");

    console.log("✅ Cleanup complete!");
    console.log(
      `Deleted: ${deleteResult.totalFiles} files (${formatSize(deleteResult.totalBytes)} freed)`,
    );
  } catch (err) {
    console.log();
    handleFileSystemError(err, targetPath);
  }
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "scan":
      await runScan(positionals[0]);
      break;

    case "duplicates":
      await runDuplicates(positionals[0]);
      break;

    case "organize":
      await runOrganize(positionals[0], options.output);
      break;

    case "cleanup":
      await runCleanup(
        positionals[0],
        options["older-than"],
        Boolean(options.confirm),
      );
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
      console.log("  organize <dir> --output <dir>           Sort by category");
      console.log(
        "  cleanup <dir> --older-than <days>   Deleting old files (dry run / --confirm)",
      );
      process.exit(command ? 1 : 0);
  }
}

main();
