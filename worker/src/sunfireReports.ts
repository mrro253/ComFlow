export function sunfireReport(kind: string | undefined) {
  if (!kind || kind === "performance") return {
    kind: "performance", tab: "Performance", visual: "Table, Submitted Enrollments - Detail Report", dated: true,
  } as const;
  if (kind === "book-of-business") return {
    kind: "book-of-business", tab: "Book of Business", visual: "Table, Detail Report", dated: false,
  } as const;
  throw new Error("Unsupported SunFire research report");
}
