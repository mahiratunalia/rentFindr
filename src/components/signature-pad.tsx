"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const PAD_W = 380;
const PAD_H = 130;

function renderTypedSignature(text: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = PAD_W;
  canvas.height = PAD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAD_W, PAD_H);
  ctx.fillStyle = "#111111";
  ctx.font = "italic 42px cursive";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, PAD_W / 2, PAD_H / 2, PAD_W - 32);
  return canvas.toDataURL("image/png");
}

export function SignaturePad({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState("");

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    // The canvas has a fixed intrinsic drawing surface (PAD_W×PAD_H) but is
    // styled to render at whatever width the layout gives it (w-full), so on
    // any screen where those differ, raw client coordinates land off-cursor —
    // scale into the canvas's own coordinate space.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx();
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111111";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStroke.current = true;
    setHasDrawn(true);
  }

  function handlePointerUp() {
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
    setHasDrawn(false);
  }

  function confirm() {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasStroke.current) return;
      const ctx = canvas.getContext("2d")!;
      // flatten onto a white background so transparency doesn't turn black in the PDF
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d")!;
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      void ctx;
      onSave(flat.toDataURL("image/png"));
    } else {
      const trimmed = typedName.trim();
      if (!trimmed) return;
      onSave(renderTypedSignature(trimmed));
    }
  }

  const canConfirm = mode === "draw" ? hasDrawn : typedName.trim().length > 0;

  // Draw/Type render different DOM in the same slot below, so switching modes
  // unmounts the canvas — reset its "has content" state whenever that happens,
  // otherwise a stale hasDrawn/hasStroke lets a blank re-mounted canvas pass
  // validation and get submitted as a signature.
  function switchMode(next: "draw" | "type") {
    if (next === mode) return;
    setMode(next);
    hasStroke.current = false;
    setHasDrawn(false);
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-1 font-mono text-[10px] uppercase tracking-widest">
        <button
          type="button"
          onClick={() => switchMode("draw")}
          className={`px-2.5 py-1 ${mode === "draw" ? "bg-foreground text-paper" : "border border-border text-muted-foreground"}`}
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => switchMode("type")}
          className={`px-2.5 py-1 ${mode === "type" ? "bg-foreground text-paper" : "border border-border text-muted-foreground"}`}
        >
          Type
        </button>
      </div>

      {mode === "draw" ? (
        <div>
          <canvas
            ref={canvasRef}
            width={PAD_W}
            height={PAD_H}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="w-full touch-none rounded-sm border border-border bg-white"
            style={{ aspectRatio: `${PAD_W} / ${PAD_H}` }}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Draw with mouse or finger
            </p>
            <button
              type="button"
              onClick={clearCanvas}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <input
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Type your full legal name"
          className="w-full border border-border bg-transparent px-3 py-3 text-lg italic outline-none placeholder:not-italic placeholder:text-sm placeholder:text-muted-foreground"
          style={{ fontFamily: "cursive" }}
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={!canConfirm || saving}
          className="flex-1 bg-foreground px-3 py-2 text-xs text-paper hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Confirm signature"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
