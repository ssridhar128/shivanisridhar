// frontend/src/pages/DirectorPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

export default function DirectorPage({ user, onLogout }) {
  const [participants, setParticipants] = useState([]);
  const [judges, setJudges] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [scores, setScores] = useState([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantPrizes, setNewParticipantPrizes] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [prizeForJudge, setPrizeForJudge] = useState({});
  const socketRef = useRef(null);

  // Init socket and fetch data
  useEffect(() => {
    fetchData();
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('identify', { userId: user.id });
      socket.emit('joinDirectors');
    });

    socket.on('scoreSubmitted', (payload) => {
      setScores((prev) => [payload, ...prev]);
    });

    socket.on('assignmentChanged', () => fetchAssignments());

    return () => socket.disconnect();
  }, []);

  async function fetchData() {
    try {
      const p = await (await fetch('http://localhost:4000/api/participants')).json();
      setParticipants(p || []);

      const j = await (await fetch('http://localhost:4000/api/users')).json();
      setJudges((j || []).filter((u) => u.role === 'JUDGE'));

      const a = await (await fetch('http://localhost:4000/api/assignments')).json();
      setAssignments(a || []);

      const s = await (await fetch('http://localhost:4000/api/scores')).json();
      setScores(s || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }

  async function fetchAssignments() {
    try {
      const a = await (await fetch('http://localhost:4000/api/assignments')).json();
      setAssignments(a || []);
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
    }
  }

  // Add new participant with multiple prizes
  async function addParticipant() {
    if (!newParticipantName || !newParticipantPrizes) return alert('Enter name and prizes');

    const prizesArray = newParticipantPrizes.split(',').map(p => p.trim()).filter(Boolean);

    try {
      const res = await fetch('http://localhost:4000/api/participants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newParticipantName, prizes: prizesArray }),
      });
      const data = await res.json();
      setParticipants((prev) => [...prev, data]);
      setNewParticipantName('');
      setNewParticipantPrizes('');

      // Automatically assign participant to judges for their prizes
      autoAssignParticipant(data);
    } catch (err) {
      console.error('Failed to add participant:', err);
    }
  }

  // Assign participant to judges based on prizes
  async function autoAssignParticipant(participant) {
    if (!participant?.prizes || participant.prizes.length === 0) return;

    for (const prize of participant.prizes) {
      // Find all judges assigned to this prize
      const judgesForPrize = judges.filter(j => j.assignedPrizes?.includes(prize));
      if (judgesForPrize.length === 0) continue;

      // Find current counts to balance assignments
      const counts = {};
      assignments.forEach(a => {
        if (a.prize === prize && a.judgeId) counts[a.judgeId] = (counts[a.judgeId] || 0) + 1;
      });

      // Pick the judge with the least participants for this prize
      judgesForPrize.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
      const chosenJudge = judgesForPrize[0];

      if (!chosenJudge) continue;

      try {
        await fetch('http://localhost:4000/api/assign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ judgeId: chosenJudge.id, participantId: participant.id, prize }),
        });
        fetchAssignments();
      } catch (err) {
        console.error('Failed to assign participant to judge:', err);
      }
    }
  }

  // Assign a prize to a judge manually
  async function assignPrizeToJudge(judgeId, prize) {
    if (!prize) return alert('Enter a prize to assign');
    try {
      await fetch('http://localhost:4000/api/assignPrize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ judgeId, prize }),
      });
      fetchAssignments();
      // Update local judge object
      setJudges(prev => prev.map(j => j.id === judgeId ? { ...j, assignedPrizes: [...(j.assignedPrizes || []), prize] } : j));
    } catch (err) {
      console.error('Failed to assign prize to judge:', err);
    }
  }

  return (
    <div className="container">
      <header>
        <h2>Director: {user.email}</h2>
        <button onClick={onLogout}>Logout</button>
      </header>

      <div className="two-col">
        {/* Participants */}
        <div className="card">
          <h3>Participants</h3>
          <input
            value={newParticipantName}
            onChange={(e) => setNewParticipantName(e.target.value)}
            placeholder="Name"
          />
          <input
            value={newParticipantPrizes}
            onChange={(e) => setNewParticipantPrizes(e.target.value)}
            placeholder="Prizes (comma separated)"
          />
          <button onClick={addParticipant}>Add Participant</button>

          <ul>
            {(participants || []).map((p) => (
              <li key={p.id}>
                {p.name} — Prizes: {(p.prizes || []).join(', ')}
              </li>
            ))}
          </ul>
        </div>

        {/* Judges */}
        <div className="card">
          <h3>Judges</h3>
          <ul>
            {(judges || []).map((j) => (
              <li key={j.id}>
                {j.email?.slice(0, 10) || j.id.slice(0, 6)}
                <input
                  placeholder="Assign prize"
                  value={prizeForJudge[j.id] || ''}
                  onChange={(e) =>
                    setPrizeForJudge((prev) => ({ ...prev, [j.id]: e.target.value }))
                  }
                />
                <button onClick={() => assignPrizeToJudge(j.id, prizeForJudge[j.id] || '')}>
                  Assign Prize
                </button>
                <div>Assigned Prizes: {(j.assignedPrizes || []).join(', ')}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Assignments */}
      <div className="card">
        <h3>Assignments</h3>
        <ul>
          {(assignments || []).map((a) => (
            <li key={a.id}>
              Judge {a.judgeId?.slice(0, 6) || '—'} → Prize: {a.prize || '—'} → Participant: {a.participantId?.slice(0, 6) || '—'}
            </li>
          ))}
        </ul>
      </div>

      {/* Scores */}
      <div className="card">
        <h3>Recent Scores (live)</h3>
        <ul>
          {(scores || []).map((s) => (
            <li key={s.id || s.submittedAt}>
              Judge {s.judgeId?.slice(0, 6) || '—'} scored Participant {s.participantId?.slice(0, 6) || '—'} — C:{s.creativity} E:{s.execution} U:{s.usability}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
