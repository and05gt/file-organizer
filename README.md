# File Organizer CLI

A fast, lightweight, and robust Node.js command-line interface (CLI) tool designed to audit, clean, and organize cluttered directories (such as your `Downloads` folder).

Built purely with modern **ES Modules**, an **EventEmitter** architecture for real-time progress reporting, and **Streams** for memory-efficient handling of large files ($\ge 10\text{ MB}$).

---

## Getting Started

### Prerequisites

- **Node.js** `v18.0.0` or higher (recommended: `v20+` for full `Dirent.parentPath` support).
- **npm** package manager.

### Installation

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <REPOSITORY_URL> file-organizer
   cd file-organizer
   ```

### Command Reference

Commands can be executed via `node file-organizer.js <command>` or via the shortcut `npm run` scripts. When using npm scripts, pass arguments and flags after the double-dash (`--`).

1. `scan` - Directory Audit & Statistics

   Recursively scans the target directory and its subfolders, gathering detailed metrics on file counts, total size, extension breakdown, modification age, top 3 largest files, and the oldest file.

   ```bash
   node file-organizer.js scan /path/to/directory
   # or via npm script
   npm run scan -- /path/to/directory
   ```

   Parameters
   - `/path/to/directory` (required): Absolute or relative path to the folder you want to inspect.

2. `duplicates` - SHA-256 Duplicate Finder

   Identifies exact duplicate files by calculating cryptographic SHA-256 checksums, regardless of file names or subfolder placement. Files are read chunk-by-chunk using `fs.createReadStream()`, preventing high RAM consumption on large media files.

   ```bash
   node file-organizer.js duplicates /path/to/directory
   # or via npm script
   npm run duplicates -- /path/to/directory
   ```

   Parameters
   - `/path/to/directory` (required): Directory path to check for duplicate content.

3. `organize` - Categorized File Sorting

   Copies files from the source directory into a structured destination folder grouped by category. Original files remain untouched.
   - Small files (< 10 MB): Copied quickly with native `fs.copyFile()`.
   - Large files ($\ge$ 10 MB): Copied via `stream/promises pipeline()` with backpressure management.
   - Name collision handling: If a file with the same name already exists in the target folder, numbers are appended automatically (`file(1).pdf`, `file(2).pdf`).

   ```bash
   node file-organizer.js organize /source/directory --output /target/directory
   # or via npm script
   npm run organize -- /source/directory --output /target/directory
   ```

   Parameters
   - `/source/directory` (required): Source path containing the files to organize.
   - `--output /target/directory` (required): Target folder where categories will be generated.

   Default Categories & Mappings

   ```
   Category:   File Extensions
   Documents:  .pdf, .docx, .doc, .txt, .md, .xlsx, .pptx
   Images:     .png, .jpg, .jpeg, .gif, .svg, .webp, .bmp
   Archives:   .zip, .rar, .tar, .gz, .7z
   Code:       .js, .py, .java, .cpp, .html, .css, .json
   Videos:     .mp4, .avi, .mkv, .mov, .webm
   Other:      All unrecognized extensions or files without an extension
   ```

4. `cleanup` - Prune Stale Files

   Finds files modified more than $N$ days ago. To prevent accidental deletions, the command defaults to Dry Run mode unless the `--confirm` flag is explicitly provided.

   Dry Run Mode (Preview Only)

   ```
   node file-organizer.js cleanup /path/to/directory --older-than 90
    # or via npm script
    npm run cleanup -- /path/to/directory --older-than 90
   ```

   Permanent Deletion Mode (`--confirm`)

   ```
   node file-organizer.js cleanup /path/to/directory --older-than 90 --confirm
    # or via npm script
    npm run cleanup -- /path/to/directory --older-than 90 --confirm
   ```

   Parameters
   - `/path/to/directory` (required): Target directory to clean up.
   - `--older-than <days>` (required): Number of days threshold based on file `mtime`.
   - `--confirm` (optional): Flags the command to execute permanent file deletion using fs.unlink().

### Project Architecture

The application follows the Separation of Concerns design principle: core business logic modules inherit from `EventEmitter` and remain completely decoupled from CLI printing and rendering logic.

```
file-organizer/
├── package.json         # Project setup, npm scripts, and ES Module config
├── .gitignore           # Git ignore patterns
├── README.md            # Project documentation
├── file-organizer.js    # CLI entry point, helpers, argument parsing & UI reporting
└── lib/
    ├── scanner.js       # Scanner class (recursive directory traversal & metrics)
    ├── duplicates.js    # DuplicateFinder class (SHA-256 stream-based hashing)
    ├── organizer.js     # Organizer class (category sorting, name collision resolution)
    └── cleanup.js       # Cleanup class (mtime checks, dry-run & deletion logic)
```

### Key Technical Highlights

- Error Handling: Standardized filesystem error intercepts for common codes (`ENOENT`, `EACCES`/`EPERM`, `ENOSPC`) exiting with code `1`.
- Recursive Safety: Employs `entry.parentPath || entry.path` for robust subfolder path resolution across operating systems.
- Terminal Progress: Non-intrusive in-place progress counters via `process.stdout.write('\r...')` that neatly preserve the final state upon job completion.
