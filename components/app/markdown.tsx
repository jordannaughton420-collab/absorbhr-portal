import * as React from "react";

// Minimal, safe Markdown renderer for policy/notice text: headings (##), bullet
// lists (-), **bold** and paragraphs. Everything is rendered as React text, so
// no HTML from the database can ever be injected into the page.

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    if (/^#{1,3} /.test(line)) {
      flush();
      blocks.push(
        <h3 key={blocks.length} className="pt-2 text-base font-semibold">
          {inline(line.replace(/^#{1,3} /, ""))}
        </h3>,
      );
    } else if (/^[-*] /.test(line)) {
      if (para.length) flush();
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return <div className="space-y-3 text-sm leading-relaxed">{blocks}</div>;
}
