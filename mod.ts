export * from './src/core.ts';

import { DOMParser } from "https://esm.sh/linkedom@0.14.26";
import { Driver, scraper } from './src/core.ts';

export async function scrape(url: string, target: unknown) {
    return await scraper(
        url,
        Driver.simple({
            parseFunction: (content: string, contentTypeHint: 'text/html' | 'text/xml' | 'image/svg+xml' = 'text/html') =>
                new DOMParser().parseFromString(content, contentTypeHint).defaultView
        }),
        target,
    ).scrape()
}