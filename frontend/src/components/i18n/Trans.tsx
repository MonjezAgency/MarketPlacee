'use client';

import * as React from 'react';

/**
 * Renders dictionary text that contains inline markup, e.g.
 *   "Message the team from <link>Support</link> or email <email>…</email>."
 * Each tag name maps to a render function, so word order stays with the
 * translation while links and emphasis stay in code. Unknown tags render
 * their text only. (scripts/check-i18n.ts checks every language uses the
 * same tags as English.)
 */
export function Trans({ text, tags }: { text: string; tags: Record<string, (chunk: React.ReactNode) => React.ReactNode> }) {
    const out: React.ReactNode[] = [];
    const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let last = 0, m: RegExpExecArray | null, k = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const render = tags[m[1]];
        out.push(<React.Fragment key={k++}>{render ? render(m[2]) : m[2]}</React.Fragment>);
        last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return <>{out}</>;
}
