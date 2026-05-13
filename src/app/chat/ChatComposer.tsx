"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

function parseCommand(raw: string): string | null {
  const cmd = raw.trim();
  if (!cmd) return null;
  if (/^run$/i.test(cmd)) return "/chat";
  const bo = cmd.match(/^BO\s+(\S+)$/i);
  if (bo) return `/ao/${encodeURIComponent(bo[1])}`;
  const p2p = cmd.match(/^P2P\s+(\S+)$/i);
  if (p2p) return `/ao/${encodeURIComponent(p2p[1])}/proposal`;
  const simu = cmd.match(/^simu\s+(\S+)$/i);
  if (simu) return `/ao/${encodeURIComponent(simu[1])}/proposal`;
  const ps = cmd.match(/^PS\s+(\S+)$/i);
  if (ps) return `/ao/${encodeURIComponent(ps[1])}`;
  const pitch = cmd.match(/^PITCH\s+(\S+)$/i);
  if (pitch) return `/ao/${encodeURIComponent(pitch[1])}/pitch`;
  const pwpl = cmd.match(/^P[WL]\s+(\S+)$/i);
  if (pwpl) return `/ao/${encodeURIComponent(pwpl[1])}/closure`;
  const section = cmd.match(/^section\s+approche\s+(\S+)$/i);
  if (section) return `/ao/${encodeURIComponent(section[1])}/proposal`;
  return null;
}

const HINTS: { label: string; fill: string }[] = [
  { label: "run pipeline",        fill: "run" },
  { label: "BO N° activer",       fill: "BO " },
  { label: "P2P N° simuler",      fill: "P2P " },
  { label: "PS N° envoyée",       fill: "PS " },
  { label: "PITCH N° soutenance", fill: "PITCH " },
  { label: "PW / PL clôture",     fill: "PW " },
  { label: "simu N°",             fill: "simu " },
  { label: "section approche N°", fill: "section approche " },
];

export default function ChatComposer() {
  const [value, setValue] = useState("");
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const url = parseCommand(value);
    if (url) {
      router.push(url);
      setValue("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="composer-row">
          <button type="button" className="iconbtn" title="Joindre" aria-label="Joindre">📎</button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tapez « run » pour lancer le pipeline · « BO 30106324 » pour activer un AO · « simu 30106324 » pour simuler…"
            aria-label="Composer un message"
          />
          <button type="button" className="send" onClick={handleSend}>↩ Envoyer</button>
        </div>
        <div className="composer-foot">
          <div className="cmds">
            {HINTS.map((h) => (
              <button
                key={h.fill}
                type="button"
                className="cmd-hint"
                onClick={() => { setValue(h.fill); textareaRef.current?.focus(); }}
              >
                {h.label}
              </button>
            ))}
          </div>
          <span className="t-meta">SiaGPT v8 · ⌘ + ↩ pour envoyer</span>
        </div>
      </div>
    </div>
  );
}
