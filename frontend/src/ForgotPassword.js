import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import "./Login.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  

  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE}/api/auth/forgot-password`, {
        email: email.trim().toLowerCase()
      });
      setMessage(response.data.message);
      setEmail("");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to send reset email right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper-zoho">
      <div className="login-shell login-shell-simple">
        <div className="login-container-zoho">
          <div className="login-brand">
            <BrandLogo className="company-logo auth-company-logo" title="ELOGIXA" />
            <div className="login-brand-copy">
              <span className="login-eyebrow">Password assistance</span>
              <h1>Reset password</h1>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="login-success">
              <span>{message}</span>
            </div>
          )}

          <form className="login-form-zoho" onSubmit={handleSubmit}>
            <div className="form-group-zoho">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16v12H4z" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <button className="login-btn-zoho" type="submit" disabled={loading}>
              {loading ? <div className="spinner"></div> : "Send Reset Link"}
            </button>
          </form>

          <div className="auth-link-row">
            <Link to="/login" className="forgot-link">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
