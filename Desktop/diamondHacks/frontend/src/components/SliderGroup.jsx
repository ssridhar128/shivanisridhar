// frontend/src/components/SliderGroup.jsx
import React from 'react';

export default function SliderGroup({ values, onChange, disabled }) {
  return (
    <div className="slider-group">
      <div className="slider-row">
        <label>Creativity: {values.creativity}</label>
        <input type="range" min="1" max="10" value={values.creativity} onChange={(e) => onChange('creativity', parseInt(e.target.value))} disabled={disabled} />
      </div>
      <div className="slider-row">
        <label>Execution: {values.execution}</label>
        <input type="range" min="1" max="10" value={values.execution} onChange={(e) => onChange('execution', parseInt(e.target.value))} disabled={disabled} />
      </div>
      <div className="slider-row">
        <label>Usability: {values.usability}</label>
        <input type="range" min="1" max="10" value={values.usability} onChange={(e) => onChange('usability', parseInt(e.target.value))} disabled={disabled} />
      </div>
    </div>
  );
}
