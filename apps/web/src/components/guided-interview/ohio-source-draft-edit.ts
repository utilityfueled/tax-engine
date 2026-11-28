export type OhioSourceDraftPath = readonly [string, ...(string | number)[]];

function replaceAtPath(value: unknown, path: OhioSourceDraftPath, index: number, replacement: unknown): unknown {
    const key = path[index];
    if (key === undefined) return replacement;

    const source = value !== null && typeof value === 'object' ? value : {};
    const copy = Array.isArray(source) ? source.slice() : { ...source };
    Reflect.set(copy, key, replaceAtPath(Reflect.get(source, key), path, index + 1, replacement));
    return copy;
}

export function editOhioSourceDraft<Draft extends { sourceFactsConfirmed: boolean | null }>(
    draft: Draft, path: OhioSourceDraftPath, value: unknown,
): Draft {
    const root = path[0];
    return {
        ...draft,
        [root]: replaceAtPath(Reflect.get(draft, root), path, 1, value),
        sourceFactsConfirmed: null,
    };
}
