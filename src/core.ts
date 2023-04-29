// deno-lint-ignore-file no-explicit-any
export enum SelectionScope { Scoped, Global }
export enum ProjectionMode { Raw, TextContent, AttributeValue, InnerHTML, OuterHTML }

type Command = (...args: any[]) => any;
type ScopeSelectCommand = (array: any[]) => any[];

const mapFactory = <T, TResult>(mapperFunction: (item: T) => TResult) => (array: T[]): TResult[] => array.map(mapperFunction);
const filterFactory = <T>(filterFunction: (item: T) => boolean) => (array: T[]): T[] => array.filter(filterFunction);

function isUrl(urlLike: string) {
    try { return ['http:', 'https:'].includes(new URL(urlLike).protocol) }
    catch { return false }
}

function isXML(xmlLike: string) {
    return (/^\s*<[\s\S]*>/).test(xmlLike);
}

class Constant<T = unknown> {
    constructor(public content: T) {}
}

class PostAction {
    content: unknown;
    actions: Command[] = [];

    constructor(content: unknown) { this.content = content }

    addAction(action: Command) {
        this.actions.push(action);
        return this;
    }
}

class ScopeSelectBase {
    postActions: ScopeSelectCommand[] = [];
    scopeParentLevel = 0;
    selectionScope = SelectionScope.Scoped;
    sliceRange?: [number] | [number, number];
    isSingle?: boolean = undefined;

    constructor(public selectors: string) { }

    addAction(action: ScopeSelectCommand) {
        this.postActions.push(action);
        return this;
    }

    map(mapperFunction: (item: any) => any) {
        this.addAction(mapFactory(mapperFunction));
        return this;
    }

    filter(filterFunction: (item: any) => boolean) {
        this.addAction(filterFactory(filterFunction));
        return this;
    }

    fromGlobal() {
        this.selectionScope = SelectionScope.Global;
        return this;
    }

    fromScope(parentLevel = 0) {
        this.selectionScope = SelectionScope.Scoped;
        this.scopeParentLevel = parentLevel;
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    multi() {
        this.isSingle = false;
        return this;
    }

    last() {
        this.sliceRange = [-1];
        this.isSingle = true;
        return this;
    }

    first() {
        this.sliceRange = [0, 1];
        this.isSingle = true;
        return this;
    }
    
    at(index = 0) {
        this.sliceRange = [index, index + 1];
        this.isSingle = true;
        return this;
    }

    range(from: number, to?: number) {
        this.sliceRange = to ? [from, to] : [from];
        this.isSingle = false;
        return this;
    }

    all() {
        this.sliceRange = undefined;
        this.isSingle = false;
        return this;
    }
}

class Scope extends ScopeSelectBase {
    parent?: Scope;
    content: unknown;
    isInjectArray = true;

    injectArray(value = true) {
        this.isInjectArray = value;
    }

}

class Select extends ScopeSelectBase {
    projectionMode = ProjectionMode.TextContent;
    projectionAttribute?: string;

    trim() {
        this.map(x => x.trim());
        return this;
    }

    textContent() {
        this.projectionMode = ProjectionMode.TextContent;
        this.projectionAttribute = undefined;
        return this;
    }

    raw() {
        this.projectionMode = ProjectionMode.Raw;
        this.projectionAttribute = undefined;
        return this;
    }

    outerHTML() {
        this.projectionMode = ProjectionMode.OuterHTML;
        this.projectionAttribute = undefined;
        return this;
    }

    innerHTML() {
        this.projectionMode = ProjectionMode.InnerHTML;
        this.projectionAttribute = undefined;
        return this;
    }

    attr(attr: string) {
        this.projectionMode = ProjectionMode.AttributeValue;
        this.projectionAttribute = attr;
        return this;
    }

    pipe(...mapperFunctions: ((item: any) => any)[]) {
        mapperFunctions.forEach(x => this.map(x));
        return this;
    }
}

type ScraperWalkOpts = { preferSingle?: boolean };
type ScraperWalkResult = [unknown, { spreadable: boolean }?];

class Scraper {
    driver: Driver;
    source: string | Select; // TODO: html/xml string

    target?: unknown;

    filters: Record<string, Command> = {};

    constructor(_driver: Driver, _source: string) { this.driver = _driver; this.source = _source; }

    async scrape() {
        if (this.source instanceof Select) {
            throw new Error('Root element\'s source can not be a select');
        }
        if (!isUrl(this.source) && !isXML(this.source)) {
            throw new Error('Source is not URL and not XML');
        }
        return await this.scrapeContent(this.source);
    }

    async scrapeContent(urlOrContent: string) {
        const page: PageHandle = await this.driver.load(urlOrContent);
        const [result] = await this.walk(page, this.target, [], {});
        return result;
    }

    private async walk(page: PageHandle, current: unknown, subtreeRootPath: NodeHandle[], opts: ScraperWalkOpts): Promise<ScraperWalkResult> {
        if (current instanceof Scraper) {
            let source = current.source;
            if (!(source instanceof Select) && !isUrl(source) && !isXML(source)) {
                source = select(source);
            }
            if (source instanceof Select) {
                // TODO: handling multiple
                const [result] = await this.walk(page, source, [...subtreeRootPath], { preferSingle: true });
                source = result as string;
                if (Array.isArray(source)) {
                    [source] = source;
                }
            }
            return [await current.scrapeContent(source as string)];

        } else if (current instanceof Scope) {
            const selected = await this.driver.select(
                page,
                current.selectors,
                current.selectionScope === SelectionScope.Scoped
                    ? subtreeRootPath[current.scopeParentLevel]
                    : undefined
            );

            const scopeNodes = current.sliceRange
                ? [...selected].slice(...current.sliceRange)
                : [...selected];

            const isContentArray = Array.isArray(current.content) && current.content.length === 1;
            const injectArray = current.isInjectArray && isContentArray;

            const returnSingle = current.isSingle ?? false; // TODO: prefersingle?
            
            if (returnSingle) {
                const [scopeNode] = scopeNodes;
                const c = current.content;
                const [result] = await this.walk(page, c, scopeNode ? [scopeNode, ...subtreeRootPath] : [...subtreeRootPath], {});
                return [result];
            }

            const ret: unknown[] = [];

            const c = injectArray 
                ? (current.content as unknown[])[0]
                : current.content;

            for (const scopeNode of scopeNodes) {
                const [result, resultOpts] = await this.walk(page, c, [scopeNode, ...subtreeRootPath], {});
                if (resultOpts?.spreadable && Array.isArray(result)) {
                    ret.push(...result);
                } else {
                    ret.push(result);
                }
            }

            return [ret, { spreadable: true }];

        } else if (current instanceof Select) {
            const scope = current.selectionScope === SelectionScope.Scoped ? subtreeRootPath[current.scopeParentLevel] : undefined;
            const selected = await this.driver.select( page, current.selectors, scope);

            const nodes = current.sliceRange
                ? [...selected].slice(...current.sliceRange)
                : [...selected];

            const results: unknown[] = [];

            for (const node of nodes) {
                const projected = await this.driver.project(node, current.projectionMode, current.projectionAttribute);
                results.push(projected);
            }

            const ret = current.postActions.reduce((current, instruction) => instruction(current), results);

            const returnSingle = current.isSingle != undefined
                ? current.isSingle
                : (opts?.preferSingle ?? false)

            return returnSingle ? [ret[0]] : [ret, { spreadable: true }];

        } else if (current instanceof PostAction) {
            const [result] = await this.walk(page, current.content, [...subtreeRootPath], {});
            return [current.actions.reduce((current, action) => action(current), result)];

        } else if (current instanceof Constant) {
            return [current.content];

        } else if (Array.isArray(current)) {

            const ret: unknown[] = [];

            // ARRAY
            if (current.length === 1) {
                const [result, resultOpts] = await this.walk(page, current[0], [...subtreeRootPath], { preferSingle: false });
                if (resultOpts?.spreadable && Array.isArray(result)) {
                    ret.push(...result);
                } else {
                    ret.push(result);
                }

            // TUPLE
            } else {
                for (const item of current) {
                    const [result] = await this.walk(page, item, [...subtreeRootPath], { preferSingle: true });
                    ret.push(result);
                }
            }

            return [ret];
            
        } else if (typeof current === 'object') {
            const keys = Object.keys(current as Record<string, unknown>);
            const ret: Record<string, unknown> = {};
            for (const key of keys) {
                const c = (current as Record<string, unknown>)[key];
                const [result] = await this.walk(page, c, [...subtreeRootPath], { preferSingle: true });
                ret[key] = result;
            }
            return [ret];

        } else if (typeof current === 'string') {
            const [selectAndAttribute, ...filterNames] = current.split('|').map(x => x.trim());
            const [selectors, attribute] = selectAndAttribute.split('@');
            const filters = filterNames.map(x => this.filters[x]);
            const s = select(selectors);
            if (attribute === 'html') {
                s.innerHTML();
            } else if(attribute) {
                s.attr(attribute);
            }
            s.pipe(...filters);
            const [result, resultOpts] = await this.walk(page, s, [...subtreeRootPath], { preferSingle: opts.preferSingle ?? true });
            return [result, resultOpts];
        }
        return [undefined];
    }
}

export interface NodeHandle extends Object { _dummy?: unknown }
export type NodeHandleList = Array<NodeHandle>;
export interface PageHandle extends Object { _dummy?: unknown }

export abstract class Driver {

    load(_urlOrContent: string): Promise<PageHandle> { throw new Error('Not Implemented!'); }

    select(_pageHandle: PageHandle, _selectors: string, _subtreeRoot?: NodeHandle): Promise<NodeHandleList> { throw new Error('Not Implemented!'); }

    project<T>(_node: NodeHandle, _projectionMode: ProjectionMode, _projectionAttribute?: string): Promise<T> { throw new Error('Not Implemented!'); }

    static simple<TFetch extends typeof fetch = typeof fetch>({ parseFunction, fetchFunction, fetchOptions }: {
        parseFunction: (content: string) => PageHandle,
        fetchFunction?: TFetch,
        fetchOptions?: Parameters<TFetch>[1]
    }) {
        const ret = new SimpleDriver(parseFunction, fetchOptions, fetchFunction ?? fetch);
        return ret;
    }
}

type Queryable = { querySelectorAll(selectors: string): NodeHandleList }

class SimpleDriver<TFetch extends typeof fetch = typeof fetch> extends Driver {

    constructor(
        public parseFunction: (content: string, contentTypeHint?: string) => PageHandle,
        public fetchOptions: Parameters<TFetch>[1],
        public fetchFunction: TFetch,
    ) { super(); }

    async load(urlOrContent: string) {
        if (isUrl(urlOrContent)) {
            const response = await this.fetchFunction(urlOrContent, this.fetchOptions);
            const contentType = response.headers.get('content-type') ?? 'text/html';
            return this.parseFunction(await response.text(), contentType);
        } else {
            return this.parseFunction(urlOrContent, 'text/html');
        }
    }

    select(pageHandle: PageHandle, selectors: string, subtreeRoot?: NodeHandle) {
        const page = pageHandle as { window: { document: Queryable } }
        const selectionRootNode = (subtreeRoot ?? page.window.document) as Queryable;
        return Promise.resolve(selectionRootNode.querySelectorAll(selectors));
    }

    project(nodeHandle: NodeHandle, projectionMode: ProjectionMode, projectionAttribute?: string) {
        const node = nodeHandle as any;
        switch (projectionMode) {
            case ProjectionMode.TextContent: return node.textContent;
            case ProjectionMode.InnerHTML: return node.innerHTML;
            case ProjectionMode.OuterHTML: return node.outerHTML;
            case ProjectionMode.AttributeValue: return node.getAttribute(projectionAttribute);
            case ProjectionMode.Raw:
            default:
                return node;
        }
    }
}

export function scraper(url: string, driver: Driver, target: unknown) {
    const ret = new Scraper(driver, url);
    ret.target = target;
    return ret;
}

export function constant<T>(content: T) {
    return new Constant(content);
}

export function scope(selectors: string, content: unknown) {
    const ret = new Scope(selectors);
    ret.content = content;
    return ret;
}

export function select(selectors: string) {
    const ret = new Select(selectors);
    return ret;
}

export function get(selectors: string) {
    return select(selectors).first();
}

export function all(selectors: string) {
    return select(selectors).all();
}

export function refine(content: unknown) {
    return new PostAction(content);
}

export function flatten<T>(content: T): PostAction;
export function flatten<T>(depth: number, content: T): PostAction;
export function flatten<T>(arg1: number | T, arg2?: T) {
    let depth = 1, content;
    if (arg2 === undefined) {
        content = arg1;
    } else {
        depth = arg1 as number;
        content = arg2;
    }
    return refine(content).addAction(x => Array.isArray(x) ? x.flat(depth) : x);
}

export function entries(content: unknown) {
    return refine(content).addAction(x => Object.fromEntries(x));
}