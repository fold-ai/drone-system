"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * The pitch deck, as a page rather than a file.
 *
 * Thirteen slides, one viewport each, snapped. Read-only by design: the deck
 * is sent as a link and there is no file to download. The .pptx lives outside
 * the repo, for our own editing.
 */

const PLAN = (
  <svg viewBox="0 0 560 575" role="img" aria-label="Plan view of the ACT-1 airframe" className="dwg">
    <line className="dw axis" x1="280" y1="18" x2="280" y2="556" />
    <path className="dw" d="M280 40 C316 97.6 330.4 154 342.4 229.6 L515.2 460 L527.2 499.6 L354.4 497.2 L280 503.2 L205.6 497.2 L32.8 499.6 L44.8 460 L217.6 229.6 C229.6 154 244 97.6 280 40 Z" />
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
  </svg>
);

const PROFILE = (
  <svg viewBox="0 0 560 172" role="img" aria-label="Side profile of the ACT-1 airframe" className="dwg">
    <line className="dw axis" x1="20" y1="100" x2="545" y2="100" />
    <path className="dw" d="M40 77 C92 58 162 49 225 48 L504 53 L518 56 L518 73 L504 76" />
    <path className="dw" d="M40 77 C88 88 150 104 214 118 C290 130 420 132 504 131 L504 76" />
    <path className="dw thin" d="M214 62 C250 44 300 42 332 52" />
    <path className="dw" d="M466 96 L506 96 L506 38 L482 38 Z" />
  </svg>
);

export default function Deck() {
  const scroller = useRef(null);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(13);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const slides = Array.from(el.querySelectorAll(".slide"));
    setTotal(slides.length);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setAt(slides.indexOf(e.target));
        });
      },
      { root: el, threshold: 0.55 }
    );
    slides.forEach((s) => io.observe(s));

    const go = (dir) => {
      const i = Math.min(slides.length - 1, Math.max(0, slides.indexOf(slides[at]) + dir));
      slides[i].scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const onKey = (ev) => {
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(ev.key)) {
        ev.preventDefault();
        go(1);
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(ev.key)) {
        ev.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      io.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [at]);

  return (
    <div className="deck" ref={scroller}>
      <div className="deck-bar">
        <a className="deck-home" href="/">
          <Image src="/actprove-wordmark.png" alt="Actprove" width={900} height={90} priority />
        </a>
        <span className="deck-count">
          {String(at + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

      {/* 1 */}
      <section className="slide s-title">
        <div>
          <Image className="deck-lockup" src="/actprove-lockup.png" alt="Actprove Defense Technologies" width={900} height={146} priority />
          <h1>We build fast aircraft and the intelligence that flies them.</h1>
          <p className="kicker">ACT-1 airframe, PROVE-1 autonomy, 2026</p>
        </div>
        <div className="s-title-art">{PLAN}</div>
      </section>

      {/* 2 */}
      <section className="slide">
        <h2>Three problems we are building against</h2>
        <div className="rows">
          <div className="row">
            <h3>The exchange rate is upside down</h3>
            <p>A cheap airframe is routinely stopped by an interceptor that costs many times more than the thing it destroyed. Defence loses money on every success.</p>
          </div>
          <div className="row">
            <h3>The link is the weak point</h3>
            <p>Jamming and terrain break the connection to the operator. Most unmanned aircraft become useless the moment the command post goes quiet.</p>
          </div>
          <div className="row">
            <h3>One operator per aircraft does not scale</h3>
            <p>Manual piloting caps how many aircraft can be in the air at once, and puts the slowest part of the loop, a human on a radio, in the middle of a fast problem.</p>
          </div>
        </div>
      </section>

      {/* 3 */}
      <section className="slide">
        <h2>One airframe, one model, two roles</h2>
        <p className="lede">We build a single high-speed airframe and a single onboard model, then configure them for two missions. The hardware line, the software line and the flight test programme are shared.</p>
        <p className="tag">SHARED&nbsp;&nbsp; ACT-1 AIRFRAME&nbsp;&nbsp; + &nbsp;&nbsp;PROVE-1</p>
        <div className="cards">
          <div className="card">
            <h3>Interceptor</h3>
            <p>Meets incoming aircraft in the air. Speed and time to intercept matter more than range.</p>
          </div>
          <div className="card">
            <h3>Long-range strike</h3>
            <p>Reaches vehicles, equipment and depots at depth. Range and target recognition matter more than raw speed.</p>
          </div>
        </div>
      </section>

      {/* 4 */}
      <section className="slide">
        <h2>ACT-1</h2>
        <div className="split">
          <figure className="sheet">
            {PLAN}
            <figcaption><span>ACT-1, plan view</span><span>Not to scale</span></figcaption>
          </figure>
          <div>
            <dl className="spec">
              <div className="srow"><dt>Top speed</dt><dd>500 mph, 805 km/h</dd></div>
              <div className="srow"><dt>Configuration</dt><dd>Tailless delta, blended body, canted winglets</dd></div>
              <div className="srow"><dt>Propulsion</dt><dd>Single turbojet, centreline</dd></div>
              <div className="srow"><dt>Guidance</dt><dd>PROVE-1, onboard, no ground link required</dd></div>
              <div className="srow"><dt>Launch</dt><dd>Rail, no runway</dd></div>
              <div className="srow"><dt>Status</dt><dd>Beta flight testing, 2026</dd></div>
            </dl>
            <p className="fine">Figures are design targets, being confirmed in flight test.</p>
          </div>
        </div>
      </section>

      {/* 5 */}
      <section className="slide">
        <h2>What one aircraft costs to build</h2>
        <div className="split">
          <div>
            <p className="huge">$13,000</p>
            <p className="lede">Total build cost per ACT-1, at our current small-batch rate.</p>
            <p className="fine">Unit cost falls with volume. The figures on the right are our present bill of materials and shop time, not a projection.</p>
          </div>
          <dl className="spec money">
            <div className="srow"><dt>Airframe and structure</dt><dd>$3,400</dd></div>
            <div className="srow"><dt>Propulsion</dt><dd>$4,200</dd></div>
            <div className="srow"><dt>Avionics and compute</dt><dd>$2,600</dd></div>
            <div className="srow"><dt>Sensors</dt><dd>$1,500</dd></div>
            <div className="srow"><dt>Assembly and test</dt><dd>$1,300</dd></div>
            <div className="srow total"><dt>Total</dt><dd>$13,000</dd></div>
          </dl>
        </div>
      </section>

      {/* 6 */}
      <section className="slide">
        <h2>Why the price is the product</h2>
        <p className="lede">At this unit cost the aircraft can be spent freely. That changes two things at once: what a defender can afford to put in the air, and what a striker can afford to send at a target.</p>
        <div className="stats">
          <div><b>76</b><span>ACT-1 airframes for one million dollars, at the current build cost.</span></div>
          <div><b>1 : 1</b><span>An interceptor can be traded one for one against a threat and still come out ahead on cost.</span></div>
          <div><b>0</b><span>Runway, launch vehicle or prepared site needed. The aircraft goes off a rail.</span></div>
        </div>
      </section>

      {/* 7 */}
      <section className="slide">
        <h2>PROVE-1, the intelligence on board</h2>
        <p className="lede">Our own model, running on a compute module inside the airframe. Not in a datacentre, not on the ground. At 500 mph, one second of latency is 220 metres of flight.</p>
        <div className="grid2">
          <div className="row">
            <h3>Position without satellites</h3>
            <p>Camera and inertial data matched against terrain, so the aircraft holds its position when navigation signals are jammed or absent.</p>
          </div>
          <div className="row">
            <h3>Recognition</h3>
            <p>Classifies military equipment from onboard imagery and separates it from civilian vehicles and structures. Every call carries a confidence value, and low confidence is treated as no.</p>
          </div>
          <div className="row">
            <h3>Approach and aim point</h3>
            <p>Reads the approach geometry, weighs candidate trajectories against wind, terrain masking and target aspect, and picks the point that produces the effect the mission called for.</p>
          </div>
          <div className="row">
            <h3>Group behaviour</h3>
            <p>Aircraft share what they see over a short-range mesh and divide the target set, so two never spend themselves on the same object.</p>
          </div>
        </div>
      </section>

      {/* 8 */}
      <section className="slide">
        <h2>What happens when the command post goes quiet</h2>
        <p className="lede">A person sets the envelope before launch. The model decides inside it, and never outside it.</p>
        <div className="cards four">
          <div className="card"><span className="num">01</span><h3>Before launch</h3><p>A person sets the target set, the area, the time window and the conditions for holding off. This is the authorisation, and it is recorded.</p></div>
          <div className="card"><span className="num">02</span><h3>In flight, link up</h3><p>The operator sees what the aircraft sees and can change the task or recall it at any point.</p></div>
          <div className="card"><span className="num">03</span><h3>In flight, link lost</h3><p>PROVE-1 carries on under the same authorisation. Inside that envelope it decides which target in front of it fits the task, and in what order.</p></div>
          <div className="card"><span className="num">04</span><h3>Outside the envelope</h3><p>The aircraft does not engage. It observes, loiters, or comes home.</p></div>
        </div>
        <p className="fine">This is a design property, not a policy statement. Procurement in most of our target markets requires human judgement over the use of force, and the aircraft is built to hold that line.</p>
      </section>

      {/* 9 */}
      <section className="slide">
        <h2>Two configurations</h2>
        <div className="split">
          <div>
            <h3 className="colh">Interceptor</h3>
            <dl className="spec">
              <div className="srow"><dt>Role</dt><dd>Meets incoming unmanned aircraft in the air</dd></div>
              <div className="srow"><dt>Priority</dt><dd>Time to intercept, climb rate, close-in accuracy</dd></div>
              <div className="srow"><dt>Sensing</dt><dd>Air target detection and tracking against sky and ground clutter</dd></div>
              <div className="srow"><dt>Deployment</dt><dd>Rail launch from a defended site, minutes of notice</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="colh">Long-range strike</h3>
            <dl className="spec">
              <div className="srow"><dt>Role</dt><dd>Reaches vehicles, equipment and depots at depth</dd></div>
              <div className="srow"><dt>Priority</dt><dd>Range, endurance on the leg, target recognition on arrival</dd></div>
              <div className="srow"><dt>Sensing</dt><dd>Ground target classification, terrain matching for navigation</dd></div>
              <div className="srow"><dt>Deployment</dt><dd>Rail launch, routed around defended airspace</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* 10 */}
      <section className="slide">
        <h2>Precision comes from deciding late</h2>
        <p className="lede">A route planned on the ground is a guess about a situation that has already changed. The aircraft that decides at the last moment, with its own eyes, is the one that hits the right thing.</p>
        <div className="rows">
          <div className="row"><h3>The target moved</h3><p>Vehicles and equipment are rarely where the plan said. The model re-identifies what is in front of it and matches it against the task rather than against a coordinate.</p></div>
          <div className="row"><h3>The situation is mixed</h3><p>Military equipment sits next to civilian traffic and structures. Confidence values, not a single yes or no, decide whether the aircraft commits or holds.</p></div>
          <div className="row"><h3>The plan has to change in flight</h3><p>Weather, terrain masking and defences make the planned approach wrong. The model re-solves the approach on the way in.</p></div>
        </div>
      </section>

      {/* 11 */}
      <section className="slide">
        <h2>Where we are</h2>
        <div className="stages">
          <div><h3>2026, now</h3><p>ACT-1 in beta flight testing. PROVE-1 running on the aircraft, in test against recorded and live imagery.</p></div>
          <div><h3>Next</h3><p>Interceptor configuration to first intercept trial. Strike configuration to range trials.</p></div>
          <div><h3>After</h3><p>Second and third airframes in design. Group behaviour across several aircraft moved from bench to flight.</p></div>
        </div>
        <p className="lede">A young company. Founded 2026, engineers only, we build and test everything ourselves.</p>
        <div className="profile-art">{PROFILE}</div>
      </section>

      {/* 12 */}
      <section className="slide">
        <h2>What we are looking for</h2>
        <div className="rows">
          <div className="row"><h3>Capital</h3><p>To move both configurations from beta to a repeatable build, and to hire in flight controls, propulsion and perception.</p></div>
          <div className="row"><h3>A flight test partner</h3><p>Airspace and a range where we can fly the interceptor against real targets.</p></div>
          <div className="row"><h3>First customers</h3><p>Units willing to trial a cheap aircraft that keeps working when the link does not.</p></div>
        </div>
        <a className="mailto" href="mailto:contact@actprove.com">contact@actprove.com</a>
      </section>

      {/* 13 */}
      <section className="slide s-end">
        <div>
          <Image className="deck-lockup" src="/actprove-lockup.png" alt="Actprove Defense Technologies" width={900} height={146} />
          <p className="kicker big">Thirteen thousand dollars of aircraft, deciding for itself.</p>
          <a className="mailto" href="mailto:contact@actprove.com">contact@actprove.com</a>
        </div>
        <div className="s-title-art">{PLAN}</div>
      </section>
    </div>
  );
}
