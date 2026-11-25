/*
 * YOUR CODE (off-chain, decoration only). The living background behind every page, in four layers for depth:
 *   1. aura    three soft red lights drifting very slowly far behind
 *   2. arcs    the client's white neon arcs at both edges, swaying slowly, with a pulse of light running along one
 *   3. embers  small red sparks rising at three depths (a canvas, ~30 fps, stops when the tab is hidden)
 *   4. a vignette that darkens the edges so the content stays readable
 * On a mouse, near layers follow the pointer a little more than far ones (parallax).
 * With "reduce motion" switched on in the system, everything stands still.
 * It lives outside #app, so page repaints never touch it. It also holds the gradient and glow every reborn ring uses
 * (url(#fire-stroke), url(#ring-glow)).
 */

const arcs = (cls) => /*html*/`
    <svg viewBox="0 0 400 1000" fill="none" aria-hidden="true">
        <defs>
            <linearGradient id="${cls}-fade" x1="0" y1="0" x2="0" y2="1000" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#fff" stop-opacity="0" />
                <stop offset="0.3" stop-color="#fff" stop-opacity="0.55" />
                <stop offset="0.7" stop-color="#fff" stop-opacity="0.55" />
                <stop offset="1" stop-color="#fff" stop-opacity="0" />
            </linearGradient>
            <linearGradient id="${cls}-pulse" x1="0" y1="0" x2="0" y2="1000" gradientUnits="userSpaceOnUse">
                <stop offset="0.15" stop-color="#ff4d55" stop-opacity="0" />
                <stop offset="0.5" stop-color="#ff6b72" stop-opacity="1" />
                <stop offset="0.85" stop-color="#ff4d55" stop-opacity="0" />
            </linearGradient>
        </defs>
        <g class="sway sway-a">
            ${[ 300, 372 ].map((r, i) => /*html*/`
                <circle cx="0" cy="500" r="${r + 6}" stroke="url(#${cls}-fade)" stroke-width="6" opacity="0.04" />
                <circle cx="0" cy="500" r="${r}" stroke="url(#${cls}-fade)" stroke-width="0.8" opacity="${[ 0.35, 0.3 ][i]}" />
            `).join("")}
        </g>
        <g class="sway sway-b">
            <circle cx="0" cy="500" r="346" stroke="url(#${cls}-fade)" stroke-width="10" opacity="0.06" />
            <circle cx="0" cy="500" r="340" stroke="url(#${cls}-fade)" stroke-width="1.6" opacity="0.8" />
            <circle class="pulse" cx="0" cy="500" r="340" pathLength="1000" stroke="url(#${cls}-pulse)" stroke-width="2.4" stroke-linecap="round" />
            <circle cx="0" cy="500" r="398" stroke="url(#${cls}-fade)" stroke-width="0.8" opacity="0.18" />
        </g>
    </svg>
`;

/* ------------------------------------ embers: red sparks rising at three depths */

const FRAME = 1000 / 30;

function startEmbers(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = 0;
    let height = 0;
    let sparks = [];
    let last = 0;
    let running = false;

    const spark = (anywhere) => {
        const z = [ 0.35, 0.6, 1 ][Math.floor(Math.random() * 3)];   // far, middle, near
        return {
            x: Math.random() * width,
            y: anywhere ? Math.random() * height : height + 10,
            z,
            r: (0.8 + Math.random() * 1.4) * z * 2,
            vy: (12 + Math.random() * 26) * z,
            sway: Math.random() * Math.PI * 2,
            swaySpeed: 0.4 + Math.random() * 0.8,
            life: 0.45 + Math.random() * 0.55,
        };
    };

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const count = Math.max(22, Math.min(64, Math.round((width * height) / 26000)));
        sparks = Array.from({ length: count }, () => spark(true));
    };

    const draw = (dt) => {
        ctx.clearRect(0, 0, width, height);
        for (const s of sparks) {
            s.y -= s.vy * dt;
            s.sway += s.swaySpeed * dt;
            const x = s.x + Math.sin(s.sway) * 14 * s.z;
            // Fade in at the bottom, out towards the top, and flicker a little
            const rise = 1 - s.y / height;
            const alpha = Math.max(0, Math.min(1, rise * 4) * (1 - rise) * s.life * (0.75 + Math.sin(s.sway * 3) * 0.25));
            if (s.y < -10 || alpha <= 0.002 && rise > 0.5) Object.assign(s, spark(false));
            ctx.fillStyle = `rgba(232, 32, 46, ${alpha * 0.22})`;
            ctx.beginPath();
            ctx.arc(x, s.y, s.r * 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255, ${110 + Math.round(60 * s.z)}, ${100 + Math.round(40 * s.z)}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const loop = (now) => {
        if (!running) return;
        requestAnimationFrame(loop);
        if (now - last < FRAME) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        draw(dt);
    };

    const play = () => {
        if (running) return;
        running = true;
        last = performance.now();
        requestAnimationFrame(loop);
    };
    const pause = () => { running = false; };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
    play();
}

/* ------------------------------------ parallax: near layers follow the pointer more than far ones */

function followPointer(layer) {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let x = 0;
    let y = 0;
    let isQueued = false;
    window.addEventListener("pointermove", (e) => {
        x = e.clientX / window.innerWidth - 0.5;
        y = e.clientY / window.innerHeight - 0.5;
        if (isQueued) return;
        isQueued = true;
        requestAnimationFrame(() => {
            isQueued = false;
            layer.style.setProperty("--px", x.toFixed(3));
            layer.style.setProperty("--py", y.toFixed(3));
        });
    }, { passive: true });
}

function mountBackdrop() {
    if (document.querySelector(".backdrop")) return;
    const layer = document.createElement("div");
    layer.className = "backdrop";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = /*html*/`
        <svg width="0" height="0" style="position:absolute">
            <defs>
                <linearGradient id="fire-stroke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#ff7a7a" />
                    <stop offset="0.55" stop-color="#e8202e" />
                    <stop offset="1" stop-color="#a50f1c" />
                </linearGradient>
                <filter id="ring-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
        </svg>
        <div class="aura depth-far"><span class="aura-1"></span><span class="aura-2"></span><span class="aura-3"></span></div>
        <div class="arcs depth-mid"><div class="arc-left">${arcs("arc-left")}</div><div class="arc-right">${arcs("arc-right")}</div></div>
        <canvas class="embers depth-near"></canvas>
        <div class="vignette"></div>
    `;
    document.body.prepend(layer);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    startEmbers(layer.querySelector(".embers"));
    followPointer(layer);
}

export { mountBackdrop };
