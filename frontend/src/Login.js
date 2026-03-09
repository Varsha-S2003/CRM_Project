import { useState } from "react";
import axios from "axios";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const [identifier, setIdentifier] = useState(""); // email or username
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!identifier.trim() || !password) {
      setError("Please enter your email/username and password.");
      return;
    }

    try {
      setLoading(true);
      const resp = await axios.post(
        `${API_BASE}/api/auth/login`,
        { email: identifier, password },
        { headers: { "Content-Type": "application/json" } }
      );

      const { token, user } = resp.data;
      localStorage.setItem("token", token);
      localStorage.setItem("userId", user.id || user._id || "");
      localStorage.setItem("username", user.username);
      localStorage.setItem("role", user.role);
      localStorage.setItem("employee_id", user.employee_id || "");

      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper-zoho">
      <div className="login-container-zoho">
        <div className="login-brand">
          <div className="brand-icon">
            {/* simple icon, could replace */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <h1>Welcome Back</h1>
          <p>Please sign in to your account</p>
        </div>

        {error && (
          <div className="login-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4" />
              <circle cx="12" cy="16" r="1" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form className="login-form-zoho" onSubmit={handleSubmit}>
          <div className="form-group-zoho">
            <label htmlFor="identifier">Email or Username</label>
            <div className="input-wrapper">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16v16H4z" />
              </svg>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="email@domain.com or username"
              />
            </div>
          </div>

          <div className="form-group-zoho">
            <label htmlFor="password">Password</label>
            <div className="password-input-container">
              <div className="input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <input
                id="password"
                className="password-field"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="checkbox-wrapper">
              <input type="checkbox" />
              <span className="checkmark"></span>
              Remember me
            </label>
            <a href="/" className="forgot-link">
              Forgot password?
            </a>
          </div>

          <button className="login-btn-zoho" type="submit" disabled={loading}>
            {loading ? <div className="spinner"></div> : "Sign In"}
          </button>
        </form>

        <div className="login-footer">
          <p>&copy; 2026 Elogixa CRM. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}


