/**
 * One bundle definition, two transports: the dev-server middleware writes it to
 * disk, and the download path zips the same map. Adding an artifact here makes
 * it appear in both.
 */

import type { ResolvedTokens } from "../engine/types"
import { toTokensCss } from "./css"
import { estimateTokens, toDesignSystemMd } from "./designSystemMd"
import { toDtcgJson } from "./dtcg"
import { toPreviewHtml } from "./previewHtml"
import { toSkillMd } from "./skillMd"

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

export function buildExport(resolved: ResolvedTokens): ExportFile[] {
    const designSystem = toDesignSystemMd(resolved)
    return [
        {
            path: "skill/SKILL.md",
            content: toSkillMd(resolved),
            note: "Drop the skill/ folder into ~/.claude/skills/ (or symlink it).",
        },
        {
            path: "skill/references/DESIGN_SYSTEM.md",
            content: designSystem,
            note: "The reference the skill points at.",
        },
        {
            path: "tokens.css",
            content: toTokensCss(resolved),
            note: "Import once. Includes a Tailwind v4 @theme block.",
        },
        {
            path: "tokens.json",
            content: toDtcgJson(resolved),
            note: "W3C DTCG format, for Figma / Tokens Studio / Style Dictionary.",
        },
        {
            path: "preview.html",
            content: toPreviewHtml(resolved),
            note: "A readable style guide — open it in a browser, send it to anyone.",
        },
        {
            path: "brand.json",
            content: JSON.stringify(resolved.config, null, 4) + "\n",
            note: "The source of truth — re-import to keep editing.",
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

/**
 * A smoke alarm, not a speed limit.
 *
 * This number was invented by this tool and then, for a while, treated as a
 * discovered constraint — it was used to argue for splitting the reference in
 * two, which would have reduced nothing. Hendri confirmed it was never his, and
 * six acceptance runs have never once complained about length; run 5 read the
 * whole thing and produced the best build of the six.
 *
 * What it is good for is noticing a jump. It is what surfaced the duplication
 * between SKILL.md and the reference. So it stays, set well above the current
 * size, and crossing it means "look at what just grew", not "cut something".
 * The real check on whether the docs are the right length is an acceptance run.
 *
 * It went off twice in session 4, which is the alarm working, and the second
 * time is the one worth reading.
 *
 * At 24.3k against 24k: what had grown was four closed gaps and nothing
 * restated — the syntax palette and its code recipes, the chart section, the
 * layout answers run 7 had to invent, and the corrections runs 8 and 9 found.
 * The number moved to 28k.
 *
 * At 28.4k against 28k, an hour later: raising twice without cutting anything
 * is exactly how an invented ceiling becomes a discovered one, so this time the
 * cut came first. Three token descriptions were restating, at length, sections
 * written the same day — `chart-1` repeated the ceiling paragraph, `code-comment`
 * repeated the large-bar paragraph, `chart-1-subtle` repeated the band
 * paragraph — and the chart section restated its own token table. That is 333
 * tokens of genuine duplication, and it only appeared *because* the sections
 * grew: a description is the right place for a rule until a section exists to
 * hold it, and then it is a second copy.
 *
 * What remained was new: charts, area bands and geometry, and an "Outside a
 * browser" section that did not exist. So the number moved to 32k.
 *
 * The thing to watch, stated so the next person does not have to work it out:
 * the reference went 17.7k → 23.5k in one session, +33%. That is four real gaps
 * closed and it is also the fastest it has ever grown. If it goes off a third
 * time, read DECISIONS #30 first — splitting the file was tried, reduced
 * nothing, and doubled the surface for exactly the drift these runs keep
 * finding.
 */
export const DOC_BUDGET = 32_000

export function exportBudget(files: ExportFile[]): { tokens: number; overBudget: boolean } {
    const reference = files.find((file) => file.path.endsWith("DESIGN_SYSTEM.md"))
    const skill = files.find((file) => file.path.endsWith("SKILL.md"))
    const tokens = estimateTokens((reference?.content ?? "") + (skill?.content ?? ""))
    return { tokens, overBudget: tokens > DOC_BUDGET }
}
