"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import graphData from "@/data/nav_graph.json";

type GNode = { id: string; type: string; x: number; y: number; label?: string; active?: boolean; building?: string };
type GEdge = { from: string; to: string; cost: number; bidirectional: boolean; enabled?: boolean };

export default function MapEditorPage() {
  const [nodes, setNodes] = useState<GNode[]>(() => (graphData as any).nodes.map((n: any) => ({ ...n })));
  const [edges, setEdges] = useState<GEdge[]>(() => (graphData as any).edges.map((e: any) => ({ ...e })));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const didDrag = useRef(false);
  const [mode, setMode] = useState<"select" | "addJunction" | "addDest" | "addEdge" | "addRefLine">("select");
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [refLine, setRefLine] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
  const [refLineStart, setRefLineStart] = useState<{x: number, y: number} | null>(null);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
  const [showEdges, setShowEdges] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [toast, setToast] = useState("");
  const [editNode, setEditNode] = useState<GNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{from:string;to:string}|null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nextId = useRef(1);

  const nodeMap = useCallback(() => {
    const m: Record<string, GNode> = {};
    nodes.forEach(n => (m[n.id] = n));
    return m;
  }, [nodes]);

  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: Math.round(((cx - r.left) / r.width) * 10000) / 100,
      y: Math.round(((cy - r.top) / r.height) * 10000) / 100,
    };
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // --- Node CRUD ---
  const addNode = useCallback((x: number, y: number, type: "junction" | "destination") => {
    const id = type === "junction" ? `j_new_${nextId.current++}` : `new_dest_${nextId.current++}`;
    const n: GNode = { id, type, x, y, ...(type === "destination" ? { label: id, active: false, building: "" } : {}) };
    setNodes(prev => [...prev, n]);
    setSelected(new Set([id]));
    setEditNode(n);
    setMode("select");
    showToast(`Added ${type}: ${id}`);
  }, []);

  const deleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    setNodes(prev => prev.filter(n => !selected.has(n.id)));
    setEdges(prev => prev.filter(e => !selected.has(e.from) && !selected.has(e.to)));
    showToast(`Deleted ${selected.size} node(s)`);
    setSelected(new Set());
    setEditNode(null);
  }, [selected]);

  const updateNode = useCallback((id: string, patch: Partial<GNode>) => {
    setNodes(prev => prev.map(n => (n.id === id ? { ...n, ...patch } : n)));
    setEditNode(prev => (prev?.id === id ? { ...prev, ...patch } : prev));
  }, []);

  // --- Edge CRUD ---
  const addEdge = useCallback((from: string, to: string) => {
    const exists = edges.some(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
    if (exists) { showToast("Edge already exists"); return; }
    const nm = nodeMap();
    const a = nm[from], b = nm[to];
    const cost = a && b ? Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 10) / 10 : 1;
    setEdges(prev => [...prev, { from, to, cost, bidirectional: true, enabled: true }]);
    showToast(`Edge: ${from} ↔ ${to}`);
  }, [edges, nodeMap]);

  const deleteEdge = useCallback((from: string, to: string) => {
    setEdges(prev => prev.filter(e => !(e.from === from && e.to === to)));
    showToast(`Deleted edge ${from} → ${to}`);
  }, []);

  const connectSelected = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length === 2) {
      addEdge(ids[0], ids[1]);
    } else if (ids.length > 2) {
      // Connect as chain: 0→1→2→3...
      let count = 0;
      for (let i = 0; i < ids.length - 1; i++) {
        const exists = edges.some(e => (e.from === ids[i] && e.to === ids[i+1]) || (e.from === ids[i+1] && e.to === ids[i]));
        if (!exists) {
          const nm2 = nodeMap();
          const a = nm2[ids[i]], b = nm2[ids[i+1]];
          const cost = a && b ? Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 10) / 10 : 1;
          setEdges(prev => [...prev, { from: ids[i], to: ids[i+1], cost, bidirectional: true, enabled: true }]);
          count++;
        }
      }
      showToast(`Connected chain: ${count} new edge(s)`);
    } else {
      showToast("Select 2+ nodes to connect");
    }
  }, [selected, addEdge, edges, nodeMap]);

  // --- Alignment ---
  const alignToLine = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length < 3) { showToast("Select 3+ nodes (first & last = anchors)"); return; }
    const nm = nodeMap();
    const a = nm[ids[0]], b = nm[ids[ids.length - 1]];
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return;
    setNodes(prev => prev.map(n => {
      if (!selected.has(n.id) || n.id === ids[0] || n.id === ids[ids.length - 1]) return n;
      const t = ((n.x - a.x) * dx + (n.y - a.y) * dy) / len2;
      return { ...n, x: Math.round((a.x + t * dx) * 100) / 100, y: Math.round((a.y + t * dy) * 100) / 100 };
    }));
    showToast(`Aligned ${ids.length - 2} nodes to line`);
  }, [selected, nodeMap]);

  const alignX = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length < 2) return;
    const nm = nodeMap();
    const avgX = ids.reduce((s, id) => s + (nm[id]?.x || 0), 0) / ids.length;
    const x = Math.round(avgX * 100) / 100;
    setNodes(prev => prev.map(n => (selected.has(n.id) ? { ...n, x } : n)));
    showToast(`Aligned ${ids.length} nodes to x=${x}`);
  }, [selected, nodeMap]);

  const alignY = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length < 2) return;
    const nm = nodeMap();
    const avgY = ids.reduce((s, id) => s + (nm[id]?.y || 0), 0) / ids.length;
    const y = Math.round(avgY * 100) / 100;
    setNodes(prev => prev.map(n => (selected.has(n.id) ? { ...n, y } : n)));
    showToast(`Aligned ${ids.length} nodes to y=${y}`);
  }, [selected, nodeMap]);

  // --- Export ---
  const exportFull = useCallback(() => {
    const out = { ...(graphData as any), nodes, edges };
    navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    showToast("✅ Full JSON copied!");
  }, [nodes, edges]);

  // --- SVG handlers ---
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    const p = toSvg(e.clientX, e.clientY);

    if (mode === "addRefLine") {
      if (!refLineStart) {
        setRefLineStart(p);
        showToast("Start point set. Click again for end point.");
      } else {
        setRefLine({ x1: refLineStart.x, y1: refLineStart.y, x2: p.x, y2: p.y });
        setRefLineStart(null);
        setMode("addJunction"); // Auto-switch to junction mode
        showToast("Reference line set! Now adding junctions snapped to this line.");
      }
      return;
    }

    if (mode === "addJunction" || mode === "addDest") {
      let finalP = p;
      if (refLine) {
        const { x1, y1, x2, y2 } = refLine;
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 > 0) {
          const t = ((p.x - x1) * dx + (p.y - y1) * dy) / len2;
          finalP = {
            x: Math.round((x1 + t * dx) * 100) / 100,
            y: Math.round((y1 + t * dy) * 100) / 100
          };
        }
      }
      addNode(finalP.x, finalP.y, mode === "addJunction" ? "junction" : "destination");
      return;
    }

    // Only clear selection if clicking empty background (not after dragging)
    if (mode === "select") {
      setSelected(new Set());
      setEditNode(null);
    }
  }, [mode, toSvg, addNode, refLine, refLineStart]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    didDrag.current = false;
    setDragId(id);
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // If we just dragged, don't change selection
    if (didDrag.current) { didDrag.current = false; return; }
    if (mode === "addEdge") {
      if (!edgeStart) { setEdgeStart(id); showToast(`Edge from: ${id} — click second node`); }
      else { addEdge(edgeStart, id); setEdgeStart(null); /* stay in addEdge mode */ }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    } else {
      setSelected(new Set([id]));
      setEditNode(nodes.find(n => n.id === id) || null);
    }
  }, [mode, edgeStart, addEdge, nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    setMousePos(p);
    
    if (!dragId) return;
    didDrag.current = true;
    
    let finalP = p;
    if (refLine) {
      const { x1, y1, x2, y2 } = refLine;
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      if (len2 > 0) {
        const t = ((p.x - x1) * dx + (p.y - y1) * dy) / len2;
        finalP = {
          x: Math.round((x1 + t * dx) * 100) / 100,
          y: Math.round((y1 + t * dy) * 100) / 100
        };
      }
    }

    setNodes(prev => prev.map(n => (n.id === dragId ? { ...n, x: finalP.x, y: finalP.y } : n)));
  }, [dragId, toSvg, refLine]);

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editNode && document.activeElement?.tagName === "INPUT") return;
        if (selectedEdge) { deleteEdge(selectedEdge.from, selectedEdge.to); setSelectedEdge(null); return; }
        deleteSelected();
      }
      if (e.key === "Escape") { setSelectedEdge(null); }
      if (!selected.size) return;
      const step = e.shiftKey ? 0.1 : 0.5;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      if (e.key === "ArrowRight") dx = step;
      if (e.key === "ArrowUp") dy = -step;
      if (e.key === "ArrowDown") dy = step;
      if (dx === 0 && dy === 0) return;
      e.preventDefault();
      setNodes(prev => prev.map(n => selected.has(n.id) ? { ...n, x: Math.round((n.x + dx) * 100) / 100, y: Math.round((n.y + dy) * 100) / 100 } : n));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, deleteSelected, editNode, selectedEdge, deleteEdge]);

  const nm = nodeMap();

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'Inter',sans-serif", overflow: "hidden" }}>
      {/* LEFT PANEL */}
      <div style={{ width: 280, borderRight: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div style={{ padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", color: "#f59e0b" }}>🛠️ Map Editor</h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>{nodes.length} nodes, {edges.length} edges</p>
        </div>

        {/* Mode */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={labelStyle}>Mode</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(["select", "addJunction", "addDest", "addEdge", "addRefLine"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setEdgeStart(null); if (m !== "addRefLine") setRefLineStart(null); }}
                style={{ ...btnSm, background: mode === m ? "#3b82f6" : "rgba(255,255,255,0.05)", color: mode === m ? "#fff" : "rgba(255,255,255,0.7)" }}>
                {m === "select" ? "⬆ Select" : m === "addJunction" ? "＋ Junction" : m === "addDest" ? "＋ Building" : m === "addEdge" ? "🔗 Edge" : "📏 Draw Line"}
              </button>
            ))}
          </div>
          {mode === "addEdge" && edgeStart && <p style={{ fontSize: "0.7rem", color: "#f59e0b", margin: "4px 0 0" }}>From: {edgeStart}</p>}
          {refLine && (
            <div style={{ marginTop: 8, padding: "6px", background: "rgba(168, 85, 247, 0.15)", borderRadius: 6, border: "1px solid #a855f7" }}>
              <p style={{ margin: "0 0 4px", fontSize: "0.7rem", color: "#a855f7", fontWeight: "bold" }}>📏 Reference Line Active</p>
              <button onClick={() => setRefLine(null)} style={{ ...btnSm, borderColor: "#a855f7", color: "#a855f7", background: "transparent" }}>✕ Clear Line</button>
            </div>
          )}
        </div>

        {/* View */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={labelStyle}>View</p>
          <label style={chkStyle}><input type="checkbox" checked={showEdges} onChange={e => setShowEdges(e.target.checked)} /> Edges</label>
          <label style={chkStyle}><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Labels</label>
        </div>

        {/* Align */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={labelStyle}>Align ({selected.size} selected)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button onClick={alignX} style={btnSm} disabled={selected.size < 2}>↕ Align X</button>
            <button onClick={alignY} style={btnSm} disabled={selected.size < 2}>↔ Align Y</button>
            <button onClick={alignToLine} style={btnSm} disabled={selected.size < 3}>📐 Align to Line</button>
            {refLine && (
              <button onClick={() => {
                setNodes(prev => prev.map(n => {
                  if (!selected.has(n.id)) return n;
                  const { x1, y1, x2, y2 } = refLine;
                  const dx = x2 - x1, dy = y2 - y1;
                  const len2 = dx * dx + dy * dy;
                  if (len2 === 0) return n;
                  const t = ((n.x - x1) * dx + (n.y - y1) * dy) / len2;
                  return { ...n, x: Math.round((x1 + t * dx) * 100) / 100, y: Math.round((y1 + t * dy) * 100) / 100 };
                }));
                showToast(`Snapped ${selected.size} nodes to ref line`);
              }} style={{ ...btnSm, borderColor: "#a855f7", color: "#a855f7" }} disabled={selected.size === 0}>
                🧲 Snap to Line
              </button>
            )}
          </div>
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", margin: "4px 0 0" }}>
            Isometric: select nodes along a road, first+last = anchors, middle nodes snap to that line
          </p>
        </div>

        {/* Actions */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={labelStyle}>Actions</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button onClick={connectSelected} style={{ ...btnSm, borderColor: "#8b5cf6", color: "#8b5cf6" }} disabled={selected.size < 2}>🔗 Connect ({selected.size})</button>
            <button onClick={deleteSelected} style={{ ...btnSm, borderColor: "#ef4444", color: "#ef4444" }} disabled={selected.size === 0}>🗑 Delete Node</button>
            <button onClick={exportFull} style={{ ...btnSm, borderColor: "#22c55e", color: "#22c55e" }}>📋 Export JSON</button>
          </div>
          {selectedEdge && (
            <div style={{ marginTop: 6, padding: "6px 8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6 }}>
              <p style={{ margin: 0, fontSize: "0.7rem", color: "#ef4444" }}>✂ Edge: {selectedEdge.from} ↔ {selectedEdge.to}</p>
              <button onClick={() => { deleteEdge(selectedEdge.from, selectedEdge.to); setSelectedEdge(null); }}
                style={{ ...btnSm, marginTop: 4, borderColor: "#ef4444", color: "#ef4444", background: "rgba(239,68,68,0.15)" }}>🗑 Delete This Edge</button>
            </div>
          )}
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", margin: "4px 0 0" }}>
            Click edge to select → Delete key or button to remove
          </p>
        </div>

        {/* Node Editor */}
        {editNode && (
          <div style={{ padding: "8px 12px", flexGrow: 1 }}>
            <p style={labelStyle}>Edit: {editNode.id}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Field label="ID" value={editNode.id} onChange={v => {
                const oldId = editNode.id;
                setNodes(prev => prev.map(n => n.id === oldId ? { ...n, id: v } : n));
                setEdges(prev => prev.map(e => ({ ...e, from: e.from === oldId ? v : e.from, to: e.to === oldId ? v : e.to })));
                setSelected(prev => { const s = new Set(prev); s.delete(oldId); s.add(v); return s; });
                setEditNode(prev => prev ? { ...prev, id: v } : null);
              }} />
              <Field label="X" value={String(editNode.x)} onChange={v => updateNode(editNode.id, { x: parseFloat(v) || 0 })} />
              <Field label="Y" value={String(editNode.y)} onChange={v => updateNode(editNode.id, { y: parseFloat(v) || 0 })} />
              {editNode.type !== "junction" && (
                <>
                  <Field label="Label" value={editNode.label || ""} onChange={v => updateNode(editNode.id, { label: v })} />
                  <Field label="Building" value={editNode.building || ""} onChange={v => updateNode(editNode.id, { building: v })} />
                  <label style={chkStyle}>
                    <input type="checkbox" checked={editNode.active || false} onChange={e => updateNode(editNode.id, { active: e.target.checked })} />
                    Active
                  </label>
                </>
              )}
              {/* Connected edges */}
              <p style={{ ...labelStyle, marginTop: 8 }}>Edges</p>
              {edges.filter(e => e.from === editNode.id || e.to === editNode.id).map((e, i) => {
                const other = e.from === editNode.id ? e.to : e.from;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", flex: 1 }}>↔ {other}</span>
                    <button onClick={() => deleteEdge(e.from, e.to)} style={{ ...btnSm, padding: "1px 6px", borderColor: "#ef4444", color: "#ef4444", fontSize: "0.6rem" }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Keyboard help */}
        <div style={{ padding: "8px 12px", marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "0.65rem", color: "rgba(255,255,255,0.3)" }}>
          <p style={{ margin: 0 }}>⌨ Arrow keys = move 0.5 | Shift+Arrow = 0.1</p>
          <p style={{ margin: 0 }}>Ctrl+Click = multi-select | Delete = remove</p>
        </div>
      </div>

      {/* MAP */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 16, position: "relative" }}>
        {toast && <div style={{ position: "absolute", top: 16, zIndex: 99, background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "6px 16px", fontSize: "0.8rem", color: "#22c55e" }}>{toast}</div>}

        <div style={{ position: "relative", width: "min(85vmin, 900px)", height: "min(85vmin, 900px)", borderRadius: 12, overflow: "hidden", border: "2px solid rgba(255,255,255,0.15)" }}>
          <img src="/map_v3.png" alt="Map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", userSelect: "none", pointerEvents: "none" }} draggable={false} />

          <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, cursor: mode !== "select" ? "crosshair" : dragId ? "grabbing" : "default" }}
            onClick={handleSvgClick}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setDragId(null)}
            onMouseLeave={() => setDragId(null)}>

            {/* Reference Line */}
            {mode === "addRefLine" && refLineStart && mousePos && (
              <line x1={refLineStart.x} y1={refLineStart.y} x2={mousePos.x} y2={mousePos.y}
                stroke="#a855f7" strokeWidth="0.4" strokeDasharray="1 1" pointerEvents="none" />
            )}
            {refLine && (
              <line x1={refLine.x1 - (refLine.x2 - refLine.x1) * 100} y1={refLine.y1 - (refLine.y2 - refLine.y1) * 100}
                    x2={refLine.x2 + (refLine.x2 - refLine.x1) * 100} y2={refLine.y2 + (refLine.y2 - refLine.y1) * 100}
                stroke="#a855f7" strokeWidth="0.3" strokeDasharray="1 0.5" pointerEvents="none" opacity={0.6} />
            )}

            {/* Edges */}
            {showEdges && edges.map((e, i) => {
              const a = nm[e.from], b = nm[e.to];
              if (!a || !b) return null;
              const isEdgeSel = selectedEdge?.from === e.from && selectedEdge?.to === e.to;
              const isNodesSel = selected.has(e.from) && selected.has(e.to);
              return (
                <g key={i}>
                  {/* Fat invisible hit area for easy clicking */}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="transparent" strokeWidth="1.5" style={{ cursor: "pointer" }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedEdge({from:e.from,to:e.to}); setEditNode(null); showToast(`Edge: ${e.from} ↔ ${e.to} (Delete to remove)`); }} />
                  {/* Visible line */}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={isEdgeSel ? "#ef4444" : isNodesSel ? "#f59e0b" : "rgba(59,130,246,0.35)"}
                    strokeWidth={isEdgeSel ? "0.5" : isNodesSel ? "0.4" : "0.2"}
                    strokeDasharray={isEdgeSel ? "0.8 0.4" : "none"}
                    pointerEvents="none" />
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const isSel = selected.has(n.id);
              const isJunction = n.type === "junction";
              const isActive = n.active;
              const r = isSel ? (isJunction ? 1 : 1.4) : (isJunction ? 0.55 : 0.9);
              const fill = isSel ? "#f59e0b" : isJunction ? "#3b82f6" : isActive ? "#22c55e" : "#ef4444";
              return (
                <g key={n.id}>
                  <circle cx={n.x} cy={n.y} r={Math.max(r, 1.2)} fill="transparent" style={{ cursor: "grab" }}
                    onMouseDown={e => handleNodeMouseDown(e, n.id)}
                    onClick={e => handleNodeClick(e, n.id)} />
                  <circle cx={n.x} cy={n.y} r={r} fill={fill}
                    stroke={isSel ? "#fff" : "none"} strokeWidth="0.2"
                    opacity={isJunction && !isSel ? 0.7 : 0.95} pointerEvents="none" />
                  {showLabels && (
                    <text x={n.x + (isJunction ? 1.2 : 0)} y={n.y + (isJunction ? 0.4 : -1.5)}
                      textAnchor={isJunction ? "start" : "middle"} fontSize={isJunction ? "1.1" : "1.4"}
                      fill="rgba(255,255,255,0.7)" stroke="#000" strokeWidth="0.1" paintOrder="stroke"
                      pointerEvents="none" fontWeight={isSel ? 700 : 400}>
                      {isJunction ? n.id.replace("j_", "") : (n.label || n.id)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 50, fontSize: "0.7rem", color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "3px 6px", color: "#fff", fontSize: "0.75rem", outline: "none" }} />
    </div>
  );
}

const labelStyle: React.CSSProperties = { margin: "0 0 4px", fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 };
const btnSm: React.CSSProperties = { padding: "4px 8px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: "0.7rem", cursor: "pointer" };
const chkStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: "rgba(255,255,255,0.6)", cursor: "pointer" };
