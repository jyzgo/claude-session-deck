// 24 distinct colors for session identification
const PALETTE = [
  '#4a9eff', '#a78bfa', '#f472b6', '#fb923c',
  '#facc15', '#4ade80', '#2dd4bf', '#64748b',
  '#ef4444', '#22d3ee', '#818cf8', '#e879f9',
  '#f97316', '#06b6d4', '#8b5cf6', '#ec4899',
  '#84cc16', '#14b8a6', '#f59e0b', '#6366f1',
  '#10b981', '#e11d48', '#0ea5e9', '#d946ef',
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
