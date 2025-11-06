// frontend/src/pages/Login.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const domain = user.email.split("@")[1].trim().toLowerCase();
      const role = domain === "acmucsd.org" ? "DIRECTOR" : "JUDGE";

      onLogin({ id: user.uid, email: user.email, role });
    } catch (err) {
      console.error(err);
      alert("Login failed. Check email/password.");
    }
  }

  return (
    <div className="container">
      <h1>Login</h1>
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
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
