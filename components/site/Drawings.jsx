"use client";

import { useEffect, useRef } from "react";

export default function Drawings() {
  const root = useRef(null);

  useEffect(() => {
    if (!root.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const sheets = root.current.querySelectorAll(".draw");

    sheets.forEach((sheet) => {
      sheet.querySelectorAll(".dw:not(.axis)").forEach((el) => {
        try {
          const len = Math.ceil(el.getTotalLength());
          if (!len || !isFinite(len)) return;
          el.style.strokeDasharray = len;
          el.style.setProperty("--len", len);
        } catch (e) {
          /* leave the line fully drawn */
        }
      });
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const lines = en.target.querySelectorAll(".dw:not(.axis)");
          lines.forEach((el, i) => {
            el.style.transitionDelay = i * 25 + "ms";
          });
          en.target.classList.add("on");
          io.unobserve(en.target);

          // hard guarantee: once the window has passed, drop the dash entirely
          // so every line is solid even if a transition was interrupted
          window.setTimeout(() => {
            lines.forEach((el) => {
              el.style.strokeDasharray = "";
              el.style.transitionDelay = "";
              el.style.removeProperty("--len");
            });
          }, lines.length * 25 + 1100);
        });
      },
      { threshold: 0.1, rootMargin: "220px 0px" }
    );

    sheets.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={root}>
      <figure className="sheet draw" style={{ margin: 0 }}>
        <svg viewBox="0 0 560 575" role="img" aria-label="Plan view of the ACT-1 airframe">
          <line className="dw axis" x1="280" y1="18" x2="280" y2="556" />
          <path
            className="dw"
            d="M280 40 C316 97.6 330.4 154 342.4 229.6 L515.2 460 L527.2 499.6 L354.4 497.2 L280 503.2 L205.6 497.2 L32.8 499.6 L44.8 460 L217.6 229.6 C229.6 154 244 97.6 280 40 Z"
          />
          <path className="dw" d="M280 33 C297 60 309 140 309 217.6 L309 496" />
          <path className="dw" d="M280 33 C263 60 251 140 251 217.6 L251 496" />
          <line className="dw thin" x1="251" y1="217.6" x2="309" y2="217.6" />
          <line className="dw thin" x1="251" y1="496" x2="309" y2="496" />
          <ellipse className="dw thin" cx="280" cy="266" rx="22" ry="59" />
          <circle className="dw" cx="280" cy="508" r="24" />
          <circle className="dw thin" cx="280" cy="508" r="17" />
          <path className="dw" d="M517.6 496 L517.6 414 L531 443 L531 496 Z" />
          <path className="dw" d="M42.4 496 L42.4 414 L29 443 L29 496 Z" />
          <rect className="dw thin" x="454" y="423" width="36" height="62" />
          <rect className="dw thin" x="70" y="423" width="36" height="62" />
          <path className="dw lead" d="M150 118 L251 152" />
          <text className="tag" x="146" y="122" textAnchor="end">Ogive nose</text>
          <path className="dw lead" d="M452 200 L303 258" />
          <text className="tag" x="458" y="204">Sensor bay</text>
          <path className="dw lead" d="M392 545 L302 519" />
          <text className="tag" x="398" y="549">Turbojet exhaust</text>
        </svg>
        <figcaption>
          <span>ACT-1, plan view</span>
          <span>Not to scale</span>
        </figcaption>
      </figure>

      <figure className="sheet draw" style={{ margin: 0 }}>
        <svg viewBox="0 0 560 172" role="img" aria-label="Side profile of the ACT-1 airframe">
          <line className="dw axis" x1="20" y1="100" x2="545" y2="100" />
          <path className="dw" d="M40 77 C92 58 162 49 225 48 L504 53 L518 56 L518 73 L504 76" />
          <path
            className="dw"
            d="M40 77 C88 88 150 104 214 118 C290 130 420 132 504 131 L504 76"
          />
          <path className="dw thin" d="M214 62 C250 44 300 42 332 52" />
          <path className="dw" d="M466 96 L506 96 L506 38 L482 38 Z" />
          <path className="dw lead" d="M400 34 L478 44" />
          <text className="tag" x="394" y="38" textAnchor="end">Canted winglet</text>
        </svg>
        <figcaption>
          <span>ACT-1, side profile</span>
          <span>Not to scale</span>
        </figcaption>
      </figure>
    </div>
  );
}
