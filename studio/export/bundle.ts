/**
 * One bundle definition, two transports: System's Export sheet downloads or
 * zips these, and the bridge serves the same files to an agent. Adding a
 * file here makes it appear in both.
 */

import type { ResolvedTokens } from "../engine/types"
import { toTokensCss } from "./css"
import { toDtcgJson } from "./dtcg"

export interface ExportFile {
    path: string
    content: string
    /** What this file is for, shown in the export dialog. */
    note: string
    /** Binary assets travel as base64 and are decoded by the writer. */
    encoding?: "base64"
}

/**
 * Every asset the config references. Fonts and a raster logo are real files; an
 * SVG logo is already inline in `brand.json` and needs no copy.
 */
export function referencedAssets(resolved: ResolvedTokens): string[] {
    const { config } = resolved
    const names = (config.typography.fontFiles ?? []).map((file) => file.fileName)
    if (config.meta.logoFile) names.push(config.meta.logoFile)
    return [...new Set(names)]
}

/**
 * The two files the system is: the CSS a project runs on (what the bridge
 * writes into it) and the W3C DTCG JSON a design tool reads. DESIGN.md, the
 * agent-readable twin, joins them in W46; the specimen page in W44.
 */
export function buildExport(resolved: ResolvedTokens): ExportFile[] {
    return [
        {
            path: "tokens.css",
            content: toTokensCss(resolved),
            note: "Import once. Custom properties, light and dark, with a Tailwind v4 @theme block.",
        },
        {
            path: "tokens.json",
            content: toDtcgJson(resolved),
            note: "W3C DTCG 2025.10, for Figma, Penpot, Tokens Studio and Style Dictionary.",
        },
    ]
}

export const exportAsMap = (files: ExportFile[]): Record<string, string> =>
    Object.fromEntries(
        files.map((file) => [
            // The writer needs to know which entries are bytes, not text.
            file.encoding === "base64" ? `base64:${file.path}` : file.path,
            file.content,
        ]),
    )
