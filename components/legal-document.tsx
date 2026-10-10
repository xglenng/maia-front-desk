import React from "react";

export function LegalDocument({ title, content, effectiveDate }: { title: string; content: string; effectiveDate: string }) {
  const body = content.replace(/^# .*\n\n/, "").replace(/^\*\*Effective date:\*\* .*\n\n/, "");
  // A heading and its paragraph may share a block in generated documents.
  const blocks = body.replace(/^(## [^\n]+)\n(?!\n)/gm, "$1\n\n").split(/\n\n+/);
  return <main className="mx-auto min-h-screen max-w-3xl bg-white px-6 py-12 text-gray-900 shadow-sm"><article>
    <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
    <p className="mt-2 text-sm text-gray-500">Effective date: {effectiveDate}</p>
    <div className="mt-8 space-y-5 leading-7">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines[0]?.startsWith("## ")) return <h2 key={i} className="pt-3 text-2xl font-semibold">{lines[0].slice(3)}</h2>;
        return <p key={i}>{lines.map((line, j) => <span key={j}>{line.replace(/^\*\*(.*?)\*\*$/, "$1")} {j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  </article></main>;
}
