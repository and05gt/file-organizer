import { EventEmitter } from "events";
import fs from "node:fs/promises";
import path from "node:path";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

class Cleanup extends EventEmitter {
  async cleanup(directory, daysThreshold, isConfirm = false) {
    const resolvedPath = path.resolve(directory);
    this.emit("cleanup-start", {
      directory: resolvedPath,
      daysThreshold,
      isConfirm,
    });

    const entries = await fs.readdir(resolvedPath, {
      recursive: true,
      withFileTypes: true,
    });

    const now = Date.now();
    const filesToDelete = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const dir = entry.parentPath || entry.path || resolvedPath;
      const fullPath = path.join(dir, entry.name);

      try {
        const stats = await fs.stat(fullPath);
        const daysOld = Math.floor((now - stats.mtime.getTime()) / MS_PER_DAY);

        if (daysOld > daysThreshold) {
          const fileData = {
            name: entry.name,
            path: fullPath,
            size: stats.size,
            daysOld,
            dateFormatted: formatLocalDate(stats.mtime),
          };
          filesToDelete.push(fileData);
          totalBytes += stats.size;
          this.emit("file-found", fileData);
        }
      } catch (err) {
        this.emit("file-error", { file: entry.name, err });
      }
    }

    if (filesToDelete.length === 0) {
      const emptyStats = {
        files: [],
        totalFiles: 0,
        totalBytes: 0,
        deleted: false,
      };
      this.emit("cleanup-complete", emptyStats);
      return emptyStats;
    }

    if (!isConfirm) {
      const dryRunStats = {
        files: filesToDelete,
        totalFiles: filesToDelete.length,
        totalBytes,
        deleted: false,
      };
      this.emit("cleanup-complete", dryRunStats);
      return dryRunStats;
    }

    this.emit("delete-start", { count: filesToDelete.length, totalBytes });

    let deletedCount = 0;

    for (const file of filesToDelete) {
      try {
        await fs.unlink(file.path);
        deletedCount++;
        this.emit("file-deleted", {
          file: file.name,
          current: deletedCount,
          total: filesToDelete.length,
        });
      } catch (err) {
        this.emit("delete-error", { file: file.name, error: err });
      }
    }

    const finalStats = {
      files: filesToDelete,
      totalFiles: deletedCount,
      totalBytes,
      deleted: true,
    };

    this.emit("cleanup-completed", finalStats);
    return finalStats;
  }
}

export default Cleanup;
