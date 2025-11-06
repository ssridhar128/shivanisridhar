// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { db } = require('./db');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Simple "auth": server will issue a token (here token is user id) on /api/login
// For production, replace with secure auth.
app.post('/api/login', (req, res) => {
  const { name, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role required' });
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)').run(id, name, role);
  return res.json({ id, name, role });
});

// participants endpoints
app.get('/api/participants', (req, res) => {
  const rows = db.prepare('SELECT * FROM participants ORDER BY rowid').all();
  res.json(rows);
});

app.post('/api/participants', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO participants (id, name) VALUES (?, ?)').run(id, name);
  res.json({ id, name });
});

// assignments
app.get('/api/assignments', (req, res) => {
  const rows = db.prepare('SELECT * FROM assignments').all();
  res.json(rows);
});

app.post('/api/assign', (req, res) => {
  const { judgeId, participantId, roleLabel } = req.body;
  if (!judgeId) return res.status(400).json({ error: 'judgeId required' });
  const id = uuidv4();
  db.prepare('INSERT INTO assignments (id, judgeId, participantId, roleLabel) VALUES (?, ?, ?, ?)').run(id, judgeId, participantId || null, roleLabel || null);

  // notify via socket
  io && io.to(judgeId).emit('assignmentChanged', { judgeId, participantId, roleLabel });
  res.json({ id, judgeId, participantId, roleLabel });
});

// get judges and directors
app.get('/api/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users').all();
  res.json(rows);
});

// fetch scores (director view)
app.get('/api/scores', (req, res) => {
  const rows = db.prepare('SELECT * FROM scores ORDER BY submittedAt DESC').all();
  res.json(rows);
});

// ---------- Socket.IO setup ----------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const DURATION_MS = 3 * 60 * 1000; // 3 minutes
let currentPresentation = null; // { participantId, index, startTime, duration, timer }
const draftScores = new Map(); // key = `${judgeId}:${participantId}:${index}` -> { creativity, execution, usability, updatedAt }

io.on('connection', (socket) => {
  // client should send { userId } in auth when connecting or via an event
  console.log('socket connected', socket.id);

  socket.on('identify', (payload) => {
    // payload: { userId }
    const { userId } = payload || {};
    if (!userId) return;
    socket.join(userId); // private room to send direct updates
    socket.data.userId = userId;
  });

  socket.on('sliderChange', (payload) => {
    // { judgeId, participantId, index, creativity, execution, usability }
    const { judgeId, participantId, index, creativity, execution, usability } = payload || {};
    if (!judgeId || !participantId || index == null) return;
    const key = `${judgeId}:${participantId}:${index}`;
    draftScores.set(key, { creativity, execution, usability, updatedAt: Date.now() });
  });

  socket.on('submitScore', async (payload) => {
    const { judgeId, participantId, index, creativity, execution, usability } = payload || {};
    if (!judgeId || !participantId || index == null) return;
    const id = uuidv4();
    db.prepare(`INSERT INTO scores (id, judgeId, participantId, creativity, execution, usability, presentationIndex, submittedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               `).run(id, judgeId, participantId, creativity, execution, usability, index, Date.now());

    // broadcast to directors
    io.to('directors').emit('scoreSubmitted', { id, judgeId, participantId, creativity, execution, usability, index, submittedAt: Date.now() });
  });

  socket.on('joinDirectors', () => {
    socket.join('directors');
  });

  socket.on('disconnect', () => {
    // optional cleanup
  });
});

// server-side function to start presentation
async function startPresentation(participantId, index = 0, duration = DURATION_MS) {
  if (currentPresentation && currentPresentation.timer) {
    clearTimeout(currentPresentation.timer);
  }
  const startTime = Date.now();
  currentPresentation = { participantId, index, startTime, duration, timer: null };
  io.emit('presentParticipant', { participantId, index, startTime, duration });
  console.log('Started presentation', participantId, index);

  // schedule end
  currentPresentation.timer = setTimeout(async () => {
    // at the end, auto-submit drafts for judges that haven't submitted
    const judges = db.prepare('SELECT id FROM users WHERE role = ?').all('JUDGE');
    for (const j of judges) {
      const judgeId = j.id;
      // do we have a submitted score for this judge/participant/index?
      const existing = db.prepare('SELECT * FROM scores WHERE judgeId = ? AND participantId = ? AND presentationIndex = ?').get(judgeId, participantId, index);
      if (!existing) {
        const key = `${judgeId}:${participantId}:${index}`;
        if (draftScores.has(key)) {
          const draft = draftScores.get(key);
          const id = uuidv4();
          db.prepare(`INSERT INTO scores (id, judgeId, participantId, creativity, execution, usability, presentationIndex, submittedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, judgeId, participantId, draft.creativity, draft.execution, draft.usability, index, Date.now());
          io.to('directors').emit('scoreSubmitted', { id, judgeId, participantId, ...draft, index, submittedAt: Date.now() });
        } else {
          // if no draft, optionally store default zeros or skip; here we store a default 1/1/1
          const id = uuidv4();
          db.prepare(`INSERT INTO scores (id, judgeId, participantId, creativity, execution, usability, presentationIndex, submittedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, judgeId, participantId, 1, 1, 1, index, Date.now());
          io.to('directors').emit('scoreSubmitted', { id, judgeId, participantId, creativity:1, execution:1, usability:1, index, submittedAt: Date.now() });
        }
      }
    }

    io.emit('advanceParticipant', { from: participantId, index });
    currentPresentation = null;
  }, duration);
}

// director controls via API to start/advance
app.post('/api/start', (req, res) => {
  const { participantId, index } = req.body;
  if (!participantId) return res.status(400).json({ error: 'participantId required' });
  startPresentation(participantId, index || 0);
  res.json({ ok: true });
});

app.post('/api/advance', (req, res) => {
  // simply stop current and emit advance
  if (currentPresentation && currentPresentation.timer) {
    clearTimeout(currentPresentation.timer);
  }
  io.emit('advanceParticipant', { from: currentPresentation ? currentPresentation.participantId : null, index: currentPresentation ? currentPresentation.index : null });
  currentPresentation = null;
  res.json({ ok: true });
});

// start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});

// Export io for other modules (existing code uses it)
module.exports = { io };
