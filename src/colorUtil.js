// 10 high-contrast colors for session identification
const PALETTE = [
  '#4a9eff', // blue
  '#f472b6', // pink
  '#4ade80', // green
  '#fb923c', // orange
  '#a78bfa', // purple
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#ef4444', // red
  '#14b8a6', // teal
  '#e879f9', // magenta
];

// Simple hash: sum char codes, XOR with shifted values
function hashSessionId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorForSession(sessionId) {
  return PALETTE[hashSessionId(sessionId) % PALETTE.length];
}

module.exports = { PALETTE, hashSessionId, colorForSession };
