// frontend/src/pages/Signup.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import Login from "./Login";

export default function Signup({ onSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Lowercase and trim domain for reliable check
      const domain = user.email.split("@")[1].trim().toLowerCase();
      const role = domain === "acmucsd.org" ? "DIRECTOR" : "JUDGE";

      onSignup({ id: user.uid, email: user.email, role });
    } catch (err) {
      console.error(err);
      alert("Signup failed: " + err.message);
    }
  };

  if (showLogin) {
    return <Login onLogin={onSignup} />;
  }

  return (
    <div className="container">
      <h1>Sign Up</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label>Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <button type="submit">Sign Up</button>
      </form>
      <p>
        Already have an account?{" "}
        <button onClick={() => setShowLogin(true)}>Login</button>
      </p>
    </div>
  );
}
