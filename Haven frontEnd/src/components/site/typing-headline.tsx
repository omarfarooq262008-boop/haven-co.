import { useEffect, useState } from "react";

const text = "Find Your Perfect Haven";
const accentAt = 18; // "Haven"

export function TypingHeadline() {
  const [n, setN] = useState(0);
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      setOn(false);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) {
        clearInterval(id);
        setOn(false);
      }
    }, 58);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="relative block">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="invisible">Find Your Perfect <span className="text-accent">Haven</span></span>
      <span aria-hidden className="absolute inset-0">
        {text.slice(0, Math.min(n, accentAt))}
        {n > accentAt && <span className="text-accent">{text.slice(accentAt, n)}</span>}
        {on && <span className="typing-cursor" />}
      </span>
    </span>
  );
}
