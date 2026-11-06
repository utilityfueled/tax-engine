/** Spec: browser/native-control-snapshot.yaml. Read-only current locator snapshot, no retained node. */
import { expect, type Locator } from '@playwright/test';

export async function nativeControlTag(field: Locator): Promise<string> {
  let tagName = '';
  await expect.poll(async () => {
    const snapshot = await field.evaluateAll(nodes => ({
      count: nodes.length,
      tagName: nodes.length === 1 ? nodes[0]?.tagName ?? '' : '',
    }));
    tagName = snapshot.tagName;
    return snapshot.count;
  }).toBe(1);
  return tagName;
}
