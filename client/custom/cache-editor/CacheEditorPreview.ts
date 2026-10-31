import type { OsrsClient } from "../../game/OsrsClient";
import { Model } from "../../rs/model/Model";
import { Model2DRenderer } from "../../ui/model/Model2DRenderer";
import type { CacheDefinition } from "./CacheEditorModel";

/**
 * Previews for the cache editor, drawn with the client's own software model renderer.
 *
 * A definition is a *list* of model ids plus recolours, so the parts are merged first and then drawn
 * as one model - that is what makes a loc look like a loc and not like three loose planks. Sequence
 * playback reuses the same renderer's `sequenceId`/`sequenceFrame`, so an animated graphic shows a
 * frame rather than a still of its first part.
 */

export type PreviewSpec = {
    modelIds: number[];
    sequenceId?: number;
    sequenceFrame?: number;
    /** Reshape hints a definition carries (zoom, rotation, offsets). */
    zoom2d?: number;
    xan2d?: number;
    yan2d?: number;
    zan2d?: number;
    offsetX2d?: number;
    offsetY2d?: number;
    ambient?: number;
    contrast?: number;
};

const numbers = (value: unknown): number[] =>
    (Array.isArray(value) ? value : [value]).filter((entry): entry is number => Number.isInteger(entry) && (entry as number) >= 0);

/** The models a definition draws, in order, per kind. Locs carry them grouped, npcs and items flat. */
export function previewModels(definition: CacheDefinition, kind = definition.kind): number[] {
    const values = definition.values ?? {};
    if (kind === "loc") {
        // `models` is already flattened by the server's field reader.
        return numbers(values.models ?? []);
    }
    if (kind === "npc") {
        return numbers(values.modelIds ?? values.models ?? []);
    }
    if (kind === "item") {
        return numbers([values.model, values.maleModel, values.femaleModel].filter((entry) => entry !== undefined));
    }
    if (kind === "spotanim") {
        return numbers(values.modelId ?? []);
    }
    return [];
}

/** A preview spec from a definition: what to draw, how it is oriented, and which frame. */
export function previewSpec(definition: CacheDefinition, kind = definition.kind, frame = 0): PreviewSpec | null {
    const values = definition.values ?? {};
    const modelIds = previewModels(definition, kind);
    if (!modelIds.length) return null;
    const asNumber = (value: unknown) => (Number.isInteger(value) ? (value as number) : undefined);
    // A spotanim's `animationId` is a sequence; a loc's `seqId` and an npc's `idleSeqId` are too.
    const sequenceId = asNumber(values.animationId) ?? asNumber(values.seqId) ?? asNumber(values.idleSeqId);
    return {
        modelIds,
        ...(sequenceId !== undefined && sequenceId >= 0 ? { sequenceId, sequenceFrame: frame } : {}),
        ...(asNumber(values.zoom2d) !== undefined ? { zoom2d: asNumber(values.zoom2d) } : {}),
        ...(asNumber(values.xan2d) !== undefined ? { xan2d: asNumber(values.xan2d) } : {}),
        ...(asNumber(values.yan2d) !== undefined ? { yan2d: asNumber(values.yan2d) } : {}),
        ...(asNumber(values.zan2d) !== undefined ? { zan2d: asNumber(values.zan2d) } : {}),
        ...(asNumber(values.offsetX2d) !== undefined ? { offsetX2d: asNumber(values.offsetX2d) } : {}),
        ...(asNumber(values.offsetY2d) !== undefined ? { offsetY2d: asNumber(values.offsetY2d) } : {}),
        ...(asNumber(values.ambient) !== undefined ? { ambient: asNumber(values.ambient) } : {}),
        ...(asNumber(values.contrast) !== undefined ? { contrast: asNumber(values.contrast) } : {}),
    };
}

/** How many frames a sequence has, when the client can read it. */
export function sequenceFrameCount(client: OsrsClient, sequenceId: number | undefined): number {
    if (sequenceId === undefined || sequenceId < 0) return 1;
    try {
        const sequence = client.seqTypeLoader?.load?.(sequenceId);
        return Math.max(1, sequence?.frameIds?.length ?? 1);
    } catch {
        return 1;
    }
}

export type PreviewRenderer = {
    /** Draws a spec into the canvas, or explains why it cannot. */
    draw(canvas: HTMLCanvasElement, spec: PreviewSpec | null, size?: number): string | null;
};

/**
 * Builds a renderer once per client. The renderer is a plain software rasteriser, so it needs no WebGL
 * context and works on the editor page, which never enters the game render loop.
 */
export function createPreviewRenderer(client: OsrsClient): PreviewRenderer {
    const renderer = new Model2DRenderer(
        client.objTypeLoader,
        client.modelLoader,
        client.textureLoader,
        client.seqTypeLoader,
        client.seqFrameLoader,
        client.skeletalSeqLoader,
    );

    function merge(modelIds: readonly number[]): Model | null {
        const parts: Model[] = [];
        for (const id of modelIds) {
            try {
                const model = client.modelLoader.getModel(id);
                if (model) parts.push(model as unknown as Model);
            } catch {
                // A missing model is the caller's answer, not a crash.
            }
        }
        if (!parts.length) return null;
        if (parts.length === 1) return parts[0];
        try {
            return Model.merge(parts, parts.length);
        } catch {
            return parts[0];
        }
    }

    return {
        draw(canvas, spec, size = 220) {
            const context = canvas.getContext("2d");
            if (!context) return "This browser cannot draw a 2D canvas";
            canvas.width = size;
            canvas.height = size;
            context.clearRect(0, 0, size, size);
            if (!spec) return "This definition has no models to draw";
            const model = merge(spec.modelIds);
            if (!model) return `Model ${spec.modelIds[0]} is not in the cache's model archive`;
            try {
                const drawn = renderer.renderModelInstanceToCanvasWidget(
                    model,
                    {
                        xan2d: spec.xan2d, yan2d: spec.yan2d, zan2d: spec.zan2d,
                        zoom2d: spec.zoom2d ?? 1800,
                        offsetX2d: spec.offsetX2d, offsetY2d: spec.offsetY2d,
                        ambient: spec.ambient, contrast: spec.contrast,
                        sequenceId: spec.sequenceId, sequenceFrame: spec.sequenceFrame,
                    },
                    size,
                    size,
                );
                if (!drawn?.canvas) return "The model renderer returned nothing";
                context.drawImage(drawn.canvas, 0, 0);
                return null;
            } catch (error) {
                return `Could not draw model ${spec.modelIds[0]}: ${String((error as Error).message ?? error)}`;
            }
        },
    };
}
