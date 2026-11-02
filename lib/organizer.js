import { EventEmitter } from "events";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const CATEGORIES = {
  Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
  Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
  Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
  Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
  Other: [],
};

const TEN_MB = 10 * 1024 * 1024;

class Organizer extends EventEmitter {
  getCategory(ext) {
    for (const [category, extensions] of Object.entries(CATEGORIES)) {
      if (extensions.includes(ext.toLowerCase())) {
        return category;
      }
    }
    return "Other";
  }

  async getUniqueDestinationPath(targetDir, fileName) {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    let candidatePath = path.join(targetDir, fileName);
    let counter = 1;

    while (true) {
      try {
        await fs.access(candidatePath);
        candidatePath = path.join(targetDir, `${baseName}(${counter})${ext}`);
        counter++;
      } catch {
        return candidatePath;
      }
    }
  }

  async organize(sourcePath, targetPath) {
    const resolvedSource = path.resolve(sourcePath);
    const resolvedTarget = path.resolve(targetPath);
    this.emit("organize-start", {
      source: resolvedSource,
      target: resolvedTarget,
    });

    const entries = await fs.readdir(resolvedSource, {
      recursive: true,
      withFileTypes: true,
    });
    const fileEntries = entries.filter((e) => e.isFile());

    const categoryNames = Object.keys(CATEGORIES);
    for (const category of categoryNames) {
      await fs.mkdir(path.join(resolvedTarget, category), { recursive: true });
    }
    this.emit("directories-created", categoryNames);

    const stats = {
      totalCopied: 0,
      totalBytes: 0,
      byCategory: {},
    };
    categoryNames.forEach((category) => (stats.byCategory[category] = 0));

    let processedCount = 0;

    for (const entry of fileEntries) {
      const parentDir = entry.parentPath || entry.path || resolvedSource;
      const sourcePath = path.join(parentDir, entry.name);

      if (sourcePath.startsWith(resolvedTarget)) {
        continue;
      }

      this.emit("copy-start", {
        file: entry.name,
        current: processedCount + 1,
        total: fileEntries.length,
      });

      try {
        const fileStat = await fs.stat(sourcePath);
        const category = this.getCategory(path.extname(entry.name));
        const categoryDir = path.join(resolvedTarget, category);
        const destinationPath = await this.getUniqueDestinationPath(
          categoryDir,
          entry.name,
        );

        if (fileStat.size < TEN_MB) {
          await fs.copyFile(sourcePath, destinationPath);
        } else {
          await pipeline(
            createReadStream(sourcePath),
            createWriteStream(destinationPath),
          );
        }

        stats.totalCopied++;
        stats.totalBytes += fileStat.size;
        stats.byCategory[category]++;

        processedCount++;
        this.emit("copy-complete", {
          file: entry.name,
          category,
          current: processedCount,
          total: fileEntries.length,
        });
      } catch (err) {
        processedCount++;
        this.emit("copy-error", { file: entry.name, error: err });
      }
    }
    this.emit("organize-complete", stats);
    return stats;
  }
}

export default Organizer;
