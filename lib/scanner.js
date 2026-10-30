import { EventEmitter } from "events";
import fs from "node:fs/promises";
import path from "path";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

class Scanner extends EventEmitter {
  async scan(directory) {
    const resolvedPath = path.resolve(directory);
    this.emit("scan-start", { directory: resolvedPath });

    const entries = await fs.readdir(resolvedPath, {
      recursive: true,
      withFileTypes: true,
    });
    const fileEntries = entries.filter((e) => e.isFile());
    const files = [];

    for (const entry of fileEntries) {
      const dir = entry.parentPath || entry.path || resolvedPath;
      const fullPath = path.join(dir, entry.name);

      try {
        const stats = await fs.stat(fullPath);
        const fileData = {
          name: entry.name,
          path: fullPath,
          ext: path.extname(entry.name).toLowerCase() || "(no ext)",
          size: stats.size,
          mtime: stats.mtime,
        };
        files.push(fileData);
        this.emit("file-found", {
          fileData,
          current: files.length,
          total: fileEntries.length,
        });
      } catch {}
    }

    const stats = this._aggregateStats(files);
    this.emit("scan-complete", stats);
    return stats;
  }

  _aggregateStats(files) {
    const now = Date.now();
    const byType = new Map();
    const ageStats = { last7Days: 0, last30Days: 0, olderThan90: 0 };
    let totalSize = 0;
    let oldestFile = null;

    for (const file of files) {
      totalSize += file.size;

      const ext = byType.get(file.ext) || { count: 0, totalSize: 0 };
      ext.count++;
      ext.totalSize += file.size;
      byType.set(file.ext, ext);

      const ageInDays = Math.max(
        0,
        Math.floor((now - file.mtime.getTime()) / MS_PER_DAY),
      );
      if (ageInDays <= 7) ageStats.last7Days++;
      if (ageInDays <= 30) ageStats.last30Days++;
      if (ageInDays > 90) ageStats.olderThan90++;

      if (!oldestFile || file.mtime < oldestFile.mtime) {
        oldestFile = { ...file, ageInDays };
      }
    }

    const largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 3);

    return {
      totalFiles: files.length,
      totalSize,
      byType,
      ageStats,
      largestFiles,
      oldestFile,
    };
  }
}

export default Scanner;
