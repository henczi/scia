import { build, emptyDir } from "https://deno.land/x/dnt/mod.ts";

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function get_version() {
    const tag =  Deno.args[0];
    if (!tag) {
        throw new Error('Missing version tag!')
    }
    const version = tag.startsWith('v') ? tag.substring(1) : tag;
    if (!SEMVER_REGEX.test(version)) {
        throw new Error('Wrong version tag!')
    }
    return version;
}

await emptyDir("./npm_build");

await build({
    entryPoints: ["./mod.ts"],
    outDir: "./npm_build",
    shims: {
        deno: true,
        undici: true,
    },
    mappings: {
        "https://esm.sh/linkedom@0.14.26": {
            name: "linkedom",
            version: "0.14.26",
            // optionally specify if this should be a peer dependency
            peerDependency: false,
        },
    },
    package: {
        name: "scia",
        version: get_version(),
        description: "An easy to use html-to-json web scraper.",
        license: "MIT",
        repository: {
            type: "git",
            url: "git+https://github.com/henczi/scia.git",
        },
        bugs: {
            url: "https://github.com/henczi/scia/issues",
        },
        homepage: "https://github.com/henczi/scia#readme",
        keywords: [
            "api",
            "scia",
            "scrape",
            "scraper",
            "web"
        ]
    },
    postBuild() {
        Deno.copyFileSync("LICENSE", "npm_build/LICENSE");
        Deno.copyFileSync("README.md", "npm_build/README.md");
    },
});