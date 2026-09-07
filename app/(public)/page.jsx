import Image from "next/image";
import Drawings from "@/components/site/Drawings";
import wordmark from "@/public/actprove-wordmark.png";
import lockup from "@/public/actprove-lockup.png";

export default function Page() {
  return (
    <>
      <header className="nav">
        <a className="brand" href="#top" aria-label="Actprove Defense Technologies, home">
          <Image src={wordmark} alt="Actprove" priority sizes="220px" />
        </a>
        <nav>
          <ul>
            <li><a className="lnk" href="#airframe">ACT-1</a></li>
            <li><a className="lnk" href="#prove-1">PROVE-1</a></li>
            <li><a className="lnk" href="#company">Company</a></li>
            <li><a className="lnk" href="#contact">Contact</a></li>
          </ul>
        </nav>
      </header>

      <main id="top">
        <section className="hero wrap">
          <h1>We build fast aircraft and the intelligence that flies them.</h1>
          <p className="lede">
            Actprove Defense Technologies develops high-speed unmanned aircraft and onboard
            artificial intelligence that keeps flying when the operator link does not.
          </p>
          <p className="status">
            ACT-1, our first airframe, is <b>in beta flight testing</b>.
          </p>
        </section>

        <hr className="rule" />

        <section id="airframe" className="wrap">
          <h2>ACT-1</h2>
          <p>
            A tailless delta with a blended body, built around one idea: cover ground quickly,
            see clearly on the way, and stay useful with no one talking to it.
          </p>

          <div className="craft">
            <Drawings />

            <div>
              <dl className="spec">
                <div className="row">
                  <dt>Top speed</dt>
                  <dd><b>500 mph</b> <span className="alt">805 km/h</span></dd>
                </div>
                <div className="row">
                  <dt>Configuration</dt>
                  <dd>Tailless delta, blended body, canted winglets</dd>
                </div>
                <div className="row">
                  <dt>Propulsion</dt>
                  <dd>Single turbojet, centreline</dd>
                </div>
                <div className="row">
                  <dt>Guidance</dt>
                  <dd>PROVE-1, onboard, no ground link required</dd>
                </div>
                <div className="row">
                  <dt>Launch</dt>
                  <dd>Rail, no runway</dd>
                </div>
                <div className="row">
                  <dt>Programme status</dt>
                  <dd>Beta flight testing, 2026</dd>
                </div>
              </dl>
              <p className="fine">
                These are design targets. We publish them because we are testing against them
                now, and we will correct them here as flight data comes in.
              </p>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section id="prove-1" className="wrap">
          <h2>PROVE-1, the intelligence that flies the aircraft</h2>
          <p>
            PROVE-1 is our own LLM. It runs on a compute module inside the airframe, not in a
            datacentre and not on the ground. At 500 mph, one second of latency is 220 metres of
            flight, so every decision that matters is made where the sensors are.
          </p>
          <ul className="caps">
            <li>
              <h3>It knows where it is without satellites</h3>
              <p>
                Camera and inertial data are matched against terrain, so the aircraft holds its
                position when satellite navigation is jammed or absent.
              </p>
            </li>
            <li>
              <h3>It recognises what it is looking at</h3>
              <p>
                PROVE-1 classifies military equipment from onboard imagery and separates it from
                civilian vehicles and structures. Every classification carries a confidence value
                rather than a bare yes or no, and low confidence is treated as no.
              </p>
            </li>
            <li>
              <h3>It works out how to arrive</h3>
              <p>
                For a confirmed target the model reads the approach geometry, evaluates candidate
                trajectories against wind, terrain masking and the target aspect, and selects the
                aim point that produces the effect the mission called for.
              </p>
            </li>
            <li>
              <h3>It keeps its task when the command post goes quiet</h3>
              <p>
                If the link drops, the aircraft carries on under the authorisation it was given
                before launch: the target set, the area, the time window and the conditions for
                holding off. Inside that envelope PROVE-1 decides on its own which of the targets
                in front of it fits the task, and in what order. Outside it, the aircraft does not
                engage. It observes, loiters or comes home.
              </p>
            </li>
            <li>
              <h3>Aircraft that work as a group</h3>
              <p>
                Several airframes share what they see over a short-range mesh and divide the
                target set between them, so two aircraft never spend themselves on the same
                object. Each one carries on alone if the mesh breaks.
              </p>
            </li>
          </ul>
          <p className="fine">
            A person decides what ACT-1 is allowed to engage, before it leaves the rail. PROVE-1
            decides how to carry that out, and when not to.
          </p>
        </section>

        <hr className="rule" />

        <section id="company" className="wrap">
          <h2>A young company, flying early</h2>
          <p>
            Actprove was founded in 2026 by a small group of engineers who would rather fly
            hardware than describe it. We build our own airframes, write our own autonomy stack,
            and test both ourselves.
          </p>
          <div className="status-grid">
            <div className="stat"><b>2026</b><span>Founded</span></div>
            <div className="stat"><b>1</b><span>Airframe in beta flight testing</span></div>
            <div className="stat"><b>2</b><span>Next airframes in design</span></div>
            <div className="stat"><b>Hiring</b><span>Flight controls, propulsion, perception</span></div>
          </div>
        </section>

        <hr className="rule" />

        <section id="contact" className="wrap">
          <h2>Talk to us</h2>
          <p>
            For partnerships, procurement questions or engineering roles, write to us directly.
            We answer everything ourselves.
          </p>
          <a className="mail" href="mailto:contact@actprove.com">contact@actprove.com</a>
        </section>
      </main>

      <footer>
        <div className="lockup">
          <Image src={lockup} alt="Actprove Defense Technologies" sizes="300px" />
        </div>
        <p>2026</p>
        <p>ACT-1 figures are design targets under flight test</p>
      </footer>
    </>
  );
}
