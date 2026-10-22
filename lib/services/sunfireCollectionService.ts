import { listSunfireCollections, readSunfireCollection } from "@/lib/repositories/sunfireCollectionRepository";
import type { CurrentUser } from "@/types/domain";

export async function getSunfireReview(user: CurrentUser, selected?: string) {
  const collections = await listSunfireCollections(user);
  const current = selected ? collections.find((collection) => collection.hash === selected) : collections[0];
  if (selected && !current) throw new Error("Collection not found in your recent SunFire collections.");
  const collection = current ? await readSunfireCollection(user, current.hash) : null;
  // Full identifiers remain in the private source; the browser receives only a masked display.
  const rows = collection?.records.map(({ mbi, ...record }) => ({ ...record, mbiDisplay: `•••••••${mbi.slice(-4)}` })) ?? [];
  return { collections, current, range: collection ? { start: collection.start, end: collection.end } : null, rows };
}
