// frontend/src/pages/JudgePage.jsx
import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import SliderGroup from '../components/SliderGroup';

const SOCKET_URL = 'http://localhost:4000';

export default function JudgePage({ user, onLogout }) {
  const socketRef = useRef(null);
  const [participant, setParticipant] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const presentationRef = useRef(null);
  const [values, setValues] = useState({ creativity: 5, execution: 5, usability: 5 });
  const [submittedForIndex, setSubmittedForIndex] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('identify', { userId: user.id });
    });

    socket.on('presentParticipant', (data) => {
      // Only receive participants in your assigned track(s)
      if (!data.track || (user.tracks && !user.tracks.includes(data.track))) return;
      setParticipant(data);
      presentationRef.current = data;
      setSubmittedForIndex(null);
      setValues({ creativity: 5, execution: 5, usability: 5 });
    });

    socket.on('advanceParticipant', () => {
      setParticipant(null);
      presentationRef.current = null;
      setTimeLeft(null);
    });

    return () => socket.disconnect();
  }, [user]);

  useEffect(() => {
    if (!presentationRef.current) return;
    let mounted = true;
    function tick() {
      if (!presentationRef.current) return;
      const { startTime, duration } = presentationRef.current;
      const remaining = Math.max(0, startTime + duration - Date.now());
      if (!mounted) return;
      setTimeLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) return;
      requestAnimationFrame(tick);
    }
    tick();
    return () => { mounted = false; };
  }, [participant]);

  const draftTimeout = useRef(null);
  function handleSliderChange(key, val) {
    setValues((s) => ({ ...s, [key]: val }));
    clearTimeout(draftTimeout.current);
    draftTimeout.current = setTimeout(() => {
      const pres = presentationRef.current;
      if (!pres) return;
      socketRef.current.emit('sliderChange', {
        judgeId: user.id,
        participantId: pres.participantId,
        index: pres.index,
        creativity: values.creativity,
        execution: values.execution,
        usability: values.usability
      });
    }, 300);
  }

  async function submitScore() {
    if (!presentationRef.current) return;
    const pres = presentationRef.current;
    socketRef.current.emit('submitScore', {
      judgeId: user.id,
      participantId: pres.participantId,
      index: pres.index,
      creativity: values.creativity,
      execution: values.execution,
      usability: values.usability
    });
    setSubmittedForIndex(pres.index);
  }

  const final20 = timeLeft != null && timeLeft <= 20 && timeLeft > 0;

  return (
    <div className="container">
      <header>
        <h2>Judge: {user.email}</h2>
        <button onClick={onLogout}>Logout</button>
      </header>

      {participant ? (
        <div className="card">
          <h3>Now presenting: {participant.name} ({participant.track})</h3>
          <div className={`timer ${final20 ? 'final' : ''}`}>Time left: {timeLeft}s</div>

          <SliderGroup
            values={values}
            onChange={handleSliderChange}
            disabled={submittedForIndex === (presentationRef.current && presentationRef.current.index)}
          />

          <div style={{ marginTop: 12 }}>
            <button
              onClick={submitScore}
              disabled={submittedForIndex === (presentationRef.current && presentationRef.current.index)}
            >
              Submit score now
            </button>
            {final20 && <div className="warning">Final 20 seconds — submit now or your last saved draft will be auto-submitted.</div>}
            {submittedForIndex === (presentationRef.current && presentationRef.current.index) && <div className="info">Submitted ✓</div>}
          </div>
        </div>
      ) : (
        <div className="card">Waiting for next participant in your track...</div>
      )}
    </div>
  );
}
