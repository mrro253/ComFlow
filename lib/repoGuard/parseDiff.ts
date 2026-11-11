import type { ChangedFile } from "./protectedChanges";

/** Parses `git diff --name-status -M`. Renames report the new path with status R. */
export function parseNameStatus(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [code, first, second] = line.split("\t");
    const status = code[0];
    if (status === "R" && second) files.push({ path: second, status: "R" });
    else if (status === "A" || status === "M" || status === "D") files.push({ path: first, status });
    else if (status === "C" && second) files.push({ path: second, status: "A" });
    else if (first) files.push({ path: first, status: "M" });
  }
  return files;
}

/** Parses `git diff -U0` into the added lines of each file (without the leading "+"). */
export function parseAddedLines(diff: string): Record<string, string[]> {
  const added: Record<string, string[]> = {};
  let current: string | null = null;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      current = null;
    } else if (inHeader && line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      current = target === "/dev/null" ? null : target.replace(/^b\//, "");
      if (current) added[current] ??= [];
    } else if (line.startsWith("@@")) {
      inHeader = false;
    } else if (!inHeader && current && line.startsWith("+")) {
      added[current].push(line.slice(1));
    }
  }
  return added;
}

/** True when any commit message has an "Approved-by: Marshall ..." line. */
export function hasMarshallApproval(commitMessages: string): boolean {
  return /^Approved-by:\s*Marshall\b/im.test(commitMessages);
}
