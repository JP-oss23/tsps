import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchContent, getContentApiBase } from "../../network/serverConnection/contentApi";
import {
    type CacheDefinition, type CacheKind, type CacheLink, type OverlayRow,
    authoringBase, draftProblems, draftRow, inspectPath, kindsPath, linksByField, searchPath, usedByPath, withField,
} from "./CacheEditorModel";

/**
 * The cache editor page, opened at `?cache=1`. It reads through the world's content API (the same
 * origin the client already talks to) and writes only through the local authoring service, which is
 * loopback-only and refuses anything but the local client's origin.
 *
 * Nothing here repacks the cache: an overlay row is a base definition from the cache plus the fields
 * this project overrides, and the server applies it at load time.
 */

type Tab = "values" | "links" | "used" | "transforms";

const styles = {
    page: { position: "fixed", inset: 0, zIndex: 4000, background: "#12141a", color: "#e6e6e6", display: "grid", gridTemplateColumns: "300px 1fr", font: "13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace" } as const,
    side: { borderRight: "1px solid #262a33", display: "flex", flexDirection: "column", minHeight: 0 } as const,
    main: { display: "flex", flexDirection: "column", minHeight: 0 } as const,
    bar: { display: "flex", gap: 8, alignItems: "center", padding: 8, borderBottom: "1px solid #262a33" } as const,
    input: { background: "#1b1f27", color: "#e6e6e6", border: "1px solid #303643", padding: "4px 6px", minWidth: 0 } as const,
    list: { overflowY: "auto", flex: 1, minHeight: 0 } as const,
    row: (active: boolean) => ({ padding: "5px 8px", cursor: "pointer", background: active ? "#233047" : "transparent", borderBottom: "1px solid #1c2028" }) as const,
    tabs: { display: "flex", gap: 4, padding: 8, borderBottom: "1px solid #262a33" } as const,
    tab: (active: boolean) => ({ padding: "3px 8px", cursor: "pointer", background: active ? "#233047" : "#1b1f27", border: "1px solid #303643" }) as const,
    body: { overflowY: "auto", flex: 1, minHeight: 0, padding: 10 } as const,
    table: { borderCollapse: "collapse" as const, width: "100%" },
    cell: { borderBottom: "1px solid #1c2028", padding: "3px 6px", verticalAlign: "top" as const },
    tone: (state: string) => ({ color: state === "known" ? "#8fd18f" : state === "missing" ? "#e08a8a" : "#c9b06a" }) as const,
    footer: { borderTop: "1px solid #262a33", padding: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
};

export function CacheEditor() {
    const [kinds, setKinds] = useState<CacheKind[]>([]);
    const [kind, setKind] = useState("loc");
    const [text, setText] = useState("");
    const [hits, setHits] = useState<Array<{ kind: string; id: number; name: string | null; custom?: boolean }>>([]);
    const [definition, setDefinition] = useState<CacheDefinition | null>(null);
    const [history, setHistory] = useState<Array<{ kind: string; id: number }>>([]);
    const [tab, setTab] = useState<Tab>("values");
    const [used, setUsed] = useState<{ count: number; sources: Array<{ kind: string; id: number; name: string | null; field: string }> } | null>(null);
    const [draft, setDraft] = useState<OverlayRow | null>(null);
    const [status, setStatus] = useState<string>("ready");
    const [error, setError] = useState<string | null>(null);

    const contentBase = useMemo(() => getContentApiBase(), []);
    const authoring = useMemo(() => authoringBase(contentBase), [contentBase]);

    const load = useCallback(async (path: string) => {
        try {
            const body = await fetchContent(path);
            if (body?.error) throw new Error(body.error);
            return body;
        } catch (failure) {
            setError(String((failure as Error).message ?? failure));
            return null;
        }
    }, []);

    useEffect(() => {
        void (async () => {
            const body = await load(kindsPath());
            if (body?.kinds) {
                setKinds(body.kinds);
                const first = body.kinds.find((entry: CacheKind) => entry.kind === "loc" && entry.decoded);
                if (first) setKind(first.kind);
            }
        })();
    }, [load]);

    const inspect = useCallback(async (nextKind: string, id: number, push = true) => {
        setError(null);
        setUsed(null);
        setTab("values");
        const body = await load(inspectPath(nextKind, id));
        if (!body) return;
        if (push && definition) setHistory((entries) => [...entries, { kind: definition.kind, id: definition.id }].slice(-20));
        setDefinition(body as CacheDefinition);
        setDraft(null);
    }, [definition, load]);

    const runSearch = useCallback(async (needle = text, within = kind) => {
        if (!needle.trim()) return;
        setError(null);
        const body = await load(searchPath(needle, within));
        if (body?.hits) setHits(body.hits);
    }, [kind, load, text]);

    const loadUsedBy = useCallback(async () => {
        if (!definition) return;
        const body = await load(usedByPath(definition.kind, definition.id));
        if (body) setUsed(body);
    }, [definition, load]);

    const startDraft = useCallback(() => {
        if (!definition?.exists) return;
        const overlayStart = Math.max(50000, kinds.find((entry) => entry.kind === definition.kind)?.count ?? 50000);
        setDraft(draftRow(definition, definition.id, overlayStart));
        setTab("links");
        setStatus(`${definition.kind} overlay from base ${definition.id} — pick the links to override, then save`);
    }, [definition, kinds]);

    const save = useCallback(async () => {
        if (!draft || !definition) return;
        const overlayStart = Math.max(50000, kinds.find((entry) => entry.kind === draft.kind)?.count ?? 50000);
        const problems = draftProblems(draft, definition, overlayStart);
        if (problems.length) {
            setError(problems.join("; "));
            return;
        }
        if (!authoring) {
            setError("Saving needs the local authoring service; start the server with CACHE_EDITOR_ENABLED=1");
            return;
        }
        try {
            const current = await fetch(`${authoring}/definitions`).then((response) => response.json());
            const response = await fetch(`${authoring}/definitions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ row: draft, revision: current?.revision }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error ?? `save failed: ${response.status}`);
            setStatus(`saved ${draft.kind} ${draft.id} — restart the server to apply it`);
            setError(null);
        } catch (failure) {
            setError(String((failure as Error).message ?? failure));
        }
    }, [authoring, definition, draft, kinds]);

    const grouped = useMemo(() => linksByField(definition?.links), [definition]);

    const editLink = (field: string, entry: CacheLink) => {
        if (!draft) return;
        const existing = draft.fields[field];
        const next = Array.isArray(existing) ? [...(existing as number[]), entry.id] : entry.id;
        setDraft(withField(draft, field, next));
        setStatus(`${field} → ${entry.kind} ${entry.id}${entry.name ? ` (${entry.name})` : ""}`);
    };

    return (
        <div style={styles.page}>
            <div style={styles.side}>
                <div style={styles.bar}>
                    <select style={{ ...styles.input, flex: 1 }} value={kind} onChange={(event) => { setKind(event.target.value); setHits([]); }}>
                        {kinds.map((entry) => (
                            <option key={entry.kind} value={entry.kind}>
                                {entry.label} {entry.count ? `(${entry.count})` : entry.decoded ? "" : "(no decoder)"}
                            </option>
                        ))}
                    </select>
                </div>
                <div style={styles.bar}>
                    <input
                        style={{ ...styles.input, flex: 1 }}
                        placeholder="name or id, e.g. crate"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}
                    />
                    <button style={styles.input} onClick={() => void runSearch()}>Find</button>
                </div>
                <div style={styles.list}>
                    {hits.map((hit) => (
                        <div key={`${hit.kind}:${hit.id}`} style={styles.row(definition?.kind === hit.kind && definition?.id === hit.id)} onClick={() => void inspect(hit.kind, hit.id)}>
                            <span style={{ color: "#7f8899" }}>{hit.kind}</span> {hit.id} {hit.name ?? <em style={{ color: "#7f8899" }}>unnamed</em>}
                            {hit.custom ? <span style={{ color: "#c9b06a" }}> custom</span> : null}
                        </div>
                    ))}
                    {hits.length === 0 ? <div style={{ padding: 8, color: "#7f8899" }}>Search a kind, or press Find with the current kind to list matches.</div> : null}
                </div>
            </div>

            <div style={styles.main}>
                <div style={styles.bar}>
                    <button style={styles.input} onClick={() => { const previous = history.at(-1); if (previous) { setHistory((entries) => entries.slice(0, -1)); void inspect(previous.kind, previous.id, false); } }}>←</button>
                    <strong>{definition ? `${definition.kind} ${definition.id}` : "nothing selected"}</strong>
                    <span style={{ color: "#9aa3b2" }}>{definition?.name ?? (definition ? "unnamed" : "")}</span>
                    {definition && !definition.exists ? <span style={{ color: "#e08a8a" }}>{definition.note}</span> : null}
                    <span style={{ flex: 1 }} />
                    {definition?.exists ? <button style={styles.input} onClick={startDraft}>Override as new {definition.kind}</button> : null}
                </div>

                <div style={styles.tabs}>
                    {(["values", "links", "used", "transforms"] as Tab[]).map((entry) => (
                        <div key={entry} style={styles.tab(tab === entry)} onClick={() => { setTab(entry); if (entry === "used") void loadUsedBy(); }}>
                            {entry === "used" ? "used by" : entry}
                        </div>
                    ))}
                </div>

                <div style={styles.body}>
                    {!definition ? <p style={{ color: "#7f8899" }}>Pick something on the left. Links are clickable: every reference is another entry you can inspect.</p> : null}

                    {definition && tab === "values" && definition.values ? (
                        <table style={styles.table}>
                            <tbody>
                                {Object.entries(definition.values).map(([field, value]) => (
                                    <tr key={field}>
                                        <td style={{ ...styles.cell, color: "#9aa3b2", width: 220 }}>{field}</td>
                                        <td style={styles.cell}>{typeof value === "object" ? <code>{JSON.stringify(value)}</code> : String(value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : null}

                    {definition && tab === "links" ? (
                        <table style={styles.table}>
                            <tbody>
                                {grouped.map((group) => (
                                    <tr key={group.field}>
                                        <td style={{ ...styles.cell, color: "#9aa3b2", width: 220 }}>{group.field}</td>
                                        <td style={styles.cell}>
                                            {group.entries.map((entry) => (
                                                <div key={`${entry.kind}:${entry.id}`}>
                                                    <a style={{ ...styles.tone(entry.exists), cursor: "pointer" }} onClick={() => void inspect(entry.kind, entry.id)}>
                                                        {entry.kind} {entry.id}
                                                    </a>{" "}
                                                    <span style={{ color: "#9aa3b2" }}>{entry.name ?? ""}</span>{" "}
                                                    <span style={styles.tone(entry.exists)}>{entry.exists}</span>
                                                    {draft ? <button style={{ ...styles.input, marginLeft: 6 }} onClick={() => editLink(group.field, entry)}>use</button> : null}
                                                    {entry.note ? <div style={{ color: "#6f7788" }}>{entry.note}</div> : null}
                                                </div>
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : null}

                    {definition && tab === "used" ? (
                        used ? (
                            <div>
                                <p style={{ color: "#9aa3b2" }}>{used.count} references</p>
                                {used.sources.map((entry) => (
                                    <div key={`${entry.kind}:${entry.id}:${entry.field}`} style={styles.row(false)} onClick={() => void inspect(entry.kind, entry.id)}>
                                        <span style={{ color: "#7f8899" }}>{entry.kind}</span> {entry.id} {entry.name ?? ""} <span style={{ color: "#6f7788" }}>via {entry.field}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p style={{ color: "#7f8899" }}>Reading the reverse index…</p>
                    ) : null}

                    {definition && tab === "transforms" ? (
                        definition.transforms ? (
                            <div>
                                <p>{definition.transforms.note}</p>
                                {definition.transforms.gatedBy ? (
                                    <p>
                                        gated by{" "}
                                        <a style={{ cursor: "pointer", color: "#8ab4f8" }} onClick={() => void inspect(definition.transforms!.gatedBy!.kind, definition.transforms!.gatedBy!.id)}>
                                            {definition.transforms.gatedBy.kind} {definition.transforms.gatedBy.id}
                                        </a>{" "}
                                        {definition.transforms.gatedBy.name ?? ""}
                                    </p>
                                ) : null}
                                <table style={styles.table}>
                                    <tbody>
                                        {definition.transforms.children.map((child) => (
                                            <tr key={child.id}>
                                                <td style={styles.cell}>
                                                    <a style={{ cursor: "pointer", color: "#8ab4f8" }} onClick={() => void inspect(definition.kind, child.id)}>{child.id}</a>
                                                </td>
                                                <td style={styles.cell}>{child.name ?? ""}</td>
                                                <td style={styles.cell}>{child.fallback ? "fallback" : ""}</td>
                                                <td style={styles.cell}>{child.exists}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p style={{ color: "#7f8899" }}>This definition is not a multi-def.</p>
                    ) : null}
                </div>

                <div style={styles.footer}>
                    <span style={{ color: "#9aa3b2" }}>{status}</span>
                    {error ? <span style={{ color: "#e08a8a" }}>{error}</span> : null}
                    <span style={{ flex: 1 }} />
                    {draft ? (
                        <>
                            <code>{JSON.stringify({ kind: draft.kind, id: draft.id, baseId: draft.baseId, fields: draft.fields })}</code>
                            <button style={styles.input} onClick={() => void save()}>Save overlay</button>
                            <button style={styles.input} onClick={() => setDraft(null)}>Discard</button>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
