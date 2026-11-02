import { EventEmitter } from "events";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

class DuplicateFinder extends EventEmitter {
  async calculateHash(filePath) {
    const hash = createHash("sha256");
    await pipeline(createReadStream(filePath), hash);
    return hash.digest("hex");
  }

  async findDuplicates(directory) {
    const resolvedPath = path.resolve(directory);
    this.emit("search-start", { directory: resolvedPath });

    const entries = await fs.readdir(resolvedPath, {
      recursive: true,
      withFileTypes: true,
    });
    const fileEntries = entries.filter((e) => e.isFile());

    const hashMap = new Map();
    let processedCount = 0;

    for (const entry of fileEntries) {
      const dir = entry.parentPath || entry.path || resolvedPath;
      const fullPath = path.join(dir, entry.name);

      try {
        const stat = await fs.stat(fullPath);
        const hash = await this.calculateHash(fullPath);

        const group = hashMap.get(hash) || { files: [], size: stat.size };
        group.files.push(fullPath);
        hashMap.set(hash, group);

        processedCount++;
        this.emit("file-processed", {
          filePath: fullPath,
          current: processedCount,
          total: fileEntries.length,
        });
      } catch (err) {
        this.emit("file-error", { file: entry.name, err });
      }
    }

    const duplicateGroups = [];
    let totalWastedSpace = 0;

    for (const [hash, group] of hashMap) {
      if (group.files.length > 1) {
        const wastedSpace = group.size * (group.files.length - 1);
        totalWastedSpace += wastedSpace;
        duplicateGroups.push({
          hash,
          size: group.size,
          files: group.files,
          wastedSpace,
        });
      }
    }

    const result = {
      groups: duplicateGroups,
      totalWastedSpace,
      totalFilesScanned: fileEntries.length,
    };

    this.emit("duplicates-found", result);
    return result;
  }
}

export default DuplicateFinder;
