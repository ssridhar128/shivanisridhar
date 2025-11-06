import React, { useState } from "react";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import JudgePage from "./pages/JudgePage";
import DirectorPage from "./pages/DirectorPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false); // toggle between signup and login

  // If user is not logged in
  if (!user) {
    return showLogin ? (
      <div>
        <Login onLogin={setUser} />
        <p style={{ textAlign: "center", marginTop: 10 }}>
          Don't have an account?{" "}
          <button onClick={() => setShowLogin(false)}>Sign Up</button>
        </p>
      </div>
    ) : (
      <div>
        <Signup onSignup={setUser} />
        <p style={{ textAlign: "center", marginTop: 10 }}>
          Already have an account?{" "}
          <button onClick={() => setShowLogin(true)}>Login</button>
        </p>
      </div>
    );
  }

  // If user is logged in, redirect based on role
  return user.role === "JUDGE" ? (
    <JudgePage user={user} onLogout={() => setUser(null)} />
  ) : (
    <DirectorPage user={user} onLogout={() => setUser(null)} />
  );
}
