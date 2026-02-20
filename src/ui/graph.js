/**
 * src/ui/graph.js — XP History Bar Chart
 *
 * Renders a canvas-based bar chart of the last 30 days of XP.
 * Uses the device's real Date() — no library needed.
 *
 * Colour coding:
 *   Amber  = today
 *   Teal   = past days with XP
 *   Dim    = days with 0 XP
 */

export function renderXPGraph(xpHistory) {
    const canvas = document.getElementById('xp-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    /* Build the last 30 real calendar days */
    const days = [];
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }

    const values = days.map(d => xpHistory[d] || 0);
    const maxVal = Math.max(...values, 1);

    const padL = 40, padR = 16, padT = 20, padB = 36;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const barW = Math.max(2, chartW / days.length - 2);
    const gap = (chartW - barW * days.length) / (days.length + 1);

    /* Horizontal grid lines */
    for (let i = 0; i <= 4; i++) {
        const y = padT + (chartH / 4) * i;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padL - 4, y + 4);
    }

    /* Bars */
    days.forEach((day, i) => {
        const v = values[i];
        const barH = (v / maxVal) * chartH;
        const x = padL + gap + i * (barW + gap);
        const y = padT + chartH - barH;
        const isT = day === todayStr;

        ctx.fillStyle = isT
            ? `rgba(245,158,11,${v > 0 ? 1 : 0.2})`
            : `rgba(56,189,148,${v > 0 ? 0.85 : 0.12})`;

        if (barH > 0) {
            const r = Math.min(3, barH / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + barW - r, y);
            ctx.arcTo(x + barW, y, x + barW, y + r, r);
            ctx.lineTo(x + barW, y + barH);
            ctx.lineTo(x, y + barH);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
            ctx.fill();
        }

        /* Date labels every 5 days + always on today */
        if (i % 5 === 0 || isT) {
            ctx.fillStyle = isT ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.25)';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(day.slice(5), x + barW / 2, H - padB + 14);
        }
    });

    /* X-axis baseline */
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(padL, padT + chartH);
    ctx.lineTo(W - padR, padT + chartH);
    ctx.stroke();
}
