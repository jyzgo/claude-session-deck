const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');

/**
 * Encode a filesystem path to Claude's project directory name.
 * e.g. "e:\ToolBox" → "e--ToolBox"
 */
function encodeProjectPath(fsPath) {
  return fsPath.replace(/[:\\/]/g, '-').replace(/-+$/, '');
}

/**
 * Find the Claude projects directory for the current workspace.
 * Tries exact match first, then case-insensitive fallback.
 */
function findProjectDir() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;

  const wsPath = folders[0].uri.fsPath;
  const encoded = encodeProjectPath(wsPath);
  const exact = path.join(PROJECTS_DIR, encoded);

  if (fs.existsSync(exact)) return { dir: exact, wsPath };

  // Case-insensitive fallback
  try {
    const entries = fs.readdirSync(PROJECTS_DIR);
    const match = entries.find(e => e.toLowerCase() === encoded.toLowerCase());
    if (match) return { dir: path.join(PROJECTS_DIR, match), wsPath };
  } catch {}

  return null;
}

/**
 * Get the set of currently active session IDs.
 * Cross-references ~/.claude/sessions/*.json with ~/.claude/ide/*.lock
 * A session is active only if its PID has a corresponding IDE lock file.
 */
function getActiveSessionIds() {
  const active = new Set();
  try {
    const ideDir = path.join(CLAUDE_DIR, 'ide');
    const lockPids = new Set();
    try {
      for (const f of fs.readdirSync(ideDir)) {
        if (f.endsWith('.lock')) lockPids.add(f.replace('.lock', ''));
      }
    } catch {}

    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
        if (data.sessionId && lockPids.has(String(data.pid))) {
          active.add(data.sessionId);
        }
      } catch {}
    }
  } catch {}
  return active;
}

/**
 * Parse a session JSONL file and extract metadata.
 * Reads first N and last N lines for efficiency on large files.
 */
function parseSessionFile(filePath, sessionId, activeIds) {
  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  let firstPrompt = '';
  let lastResponse = '';
  let aiTitle = '';
  let slug = '';
  let gitBranch = '';
  let firstTimestamp = null;
  let lastTimestamp = null;
  let userTurns = 0;
  let assistantTurns = 0;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : null;

      if (ts) {
        if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
        if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
      }

      if (obj.slug && !slug) slug = obj.slug;
      if (obj.gitBranch && !gitBranch) gitBranch = obj.gitBranch;
      if (obj.type === 'ai-title' && obj.aiTitle) aiTitle = obj.aiTitle;
      if (obj.type === 'custom-title' && obj.customTitle) aiTitle = obj.customTitle;

      if (obj.type === 'user') {
        userTurns++;
        if (!firstPrompt) {
          const c = obj.message?.content;
          if (typeof c === 'string') {
            firstPrompt = c;
          } else if (Array.isArray(c)) {
            const t = c.find(p => p.type === 'text');
            if (t) firstPrompt = t.text;
          }
        }
      } else if (obj.type === 'assistant') {
        assistantTurns++;
        const c = obj.message?.content;
        if (typeof c === 'string' && c.trim()) {
          lastResponse = c;
        } else if (Array.isArray(c)) {
          const t = [...c].reverse().find(p => p.type === 'text' && p.text?.trim());
          if (t) lastResponse = t.text;
        }
      }
    } catch {
      // Skip unparseable lines
    }
  }

  return {
    sessionId,
    aiTitle,
    slug,
    firstPrompt: firstPrompt.substring(0, 200) || '(empty)',
    lastResponse: lastResponse.substring(0, 300) || '',
    userTurns,
    assistantTurns,
    totalLines: lines.length,
    fileSize: stats.size,
    startTime: firstTimestamp,
    lastModified: lastTimestamp || stats.mtimeMs,
    gitBranch,
    isActive: activeIds.has(sessionId),
  };
}

/**
 * Get all sessions for the current workspace project.
 */
function getAllSessions() {
  const project = findProjectDir();
  if (!project) return [];

  const activeIds = getActiveSessionIds();

  try {
    const entries = fs.readdirSync(project.dir);
    const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));

    const sessions = [];
    for (const f of jsonlFiles) {
      const sessionId = f.slice(0, -6);
      try {
        const info = parseSessionFile(
          path.join(project.dir, f),
          sessionId,
          activeIds,
        );
        sessions.push(info);
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by lastModified descending
    sessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    return sessions;
  } catch {
    return [];
  }
}

/**
 * Delete a session's JSONL file and its associated directory.
 */
function deleteSession(sessionId) {
  const project = findProjectDir();
  if (!project) return false;

  const jsonlPath = path.join(project.dir, `${sessionId}.jsonl`);
  const dirPath = path.join(project.dir, sessionId);

  try {
    if (fs.existsSync(jsonlPath)) fs.unlinkSync(jsonlPath);
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = { getAllSessions, deleteSession, findProjectDir };
