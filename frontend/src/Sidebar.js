
import React from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

function Sidebar() {
  const role = localStorage.getItem("role");
  const navigate = useNavigate();

  const handleNav = (path, e) => {
    e.preventDefault();
    navigate(path);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  // compute role-based visibility once
  const roles = (role || "").toUpperCase().split(/\s*,\s*/);

  const canSee = (allowed) => {
    if (!allowed || allowed.length === 0) return true;
    return allowed.some((r) => roles.includes(r));
  };

  return (
    <div className="sidebar-zoho">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </div>
        <div className="brand-text">
          <span className="brand-name">ELOGIXA</span>
          <span className="brand-tag">CRM</span>
        </div>
      </div>
      
      <div className="sidebar-user">
        <div className="user-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div className="user-details">
          <span className="user-name">Admin User</span>
          <span className="user-role">{role || 'Admin'}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <span className="nav-section-title">Main</span>
          {canSee(["ADMIN","MANAGER","EMPLOYEE"]) && (
            <a href="/" onClick={(e) => handleNav("/dashboard", e)} className="nav-item active">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>Dashboard</span>
            </a>
          )}
          {canSee(["ADMIN","MANAGER","EMPLOYEE"]) && (
            <a href="/" onClick={(e) => handleNav("/leads", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span>Leads</span>
            </a>
          )}
          {canSee(["ADMIN","MANAGER","EMPLOYEE"]) && (
            <a href="/" onClick={(e) => handleNav("/deals", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="7" width="18" height="13" rx="2"></rect>
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path>
                <line x1="3" y1="13" x2="21" y2="13"></line>
              </svg>
              <span>Deals</span>
            </a>
          )}
          {canSee(["ADMIN","MANAGER","EMPLOYEE"]) && (
            <a href="/" onClick={(e) => handleNav("/products", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              <span>Products</span>
            </a>
          )}
          {canSee(["ADMIN","MANAGER"]) && (
            <a href="/" onClick={(e) => handleNav("/inventory", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
              <span>Inventory</span>
            </a>
          )}
          {canSee(["ADMIN","MANAGER"]) && (
            <a href="/" onClick={(e) => handleNav("/customers", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="7" r="4"></circle>
                <path d="M5.5 21h13a2 2 0 0 0 2-2v-2a7 7 0 0 0-14 0v2a2 2 0 0 0 2 2z"></path>
              </svg>
              <span>Customers</span>
            </a>
          )}
          {canSee(["ADMIN","MANAGER","EMPLOYEE"]) && (
            <a href="/" onClick={(e) => handleNav("/activities", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 2v4"></path>
                <path d="M16 2v4"></path>
                <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                <path d="M3 10h18"></path>
                <path d="M8 14h.01"></path>
                <path d="M12 14h.01"></path>
                <path d="M16 14h.01"></path>
                <path d="M8 18h.01"></path>
                <path d="M12 18h.01"></path>
              </svg>
              <span>Activities</span>
            </a>
          )}
        </div>

        <div className="nav-section">
          <span className="nav-section-title">Admin</span>
          <a href="/" onClick={(e) => handleNav("/add-employee", e)} className="nav-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span>Users</span>
          </a>
          <a href="/" className="nav-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <span>Reports</span>
          </a>
          {canSee(["ADMIN"]) && (
            <a href="/" onClick={(e) => handleNav("/settings", e)} className="nav-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.94 1.94 0 0 0 .33 2l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.94 1.94 0 0 0-2-.33 1.94 1.94 0 0 0-1 1.66V21a2 2 0 0 1-4 0v-.09a1.94 1.94 0 0 0-1-1.66 1.94 1.94 0 0 0-2 .33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.94 1.94 0 0 0 .33-2 1.94 1.94 0 0 0-1.66-1H3a2 2 0 0 1 0-4h.09a1.94 1.94 0 0 0 1.66-1 1.94 1.94 0 0 0-.33-2l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.94 1.94 0 0 0 2 .33h.06a1.94 1.94 0 0 0 1-1.66V3a2 2 0 0 1 4 0v.09a1.94 1.94 0 0 0 1 1.66h.06a1.94 1.94 0 0 0 2-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.94 1.94 0 0 0-.33 2 1.94 1.94 0 0 0 1.66 1H21a2 2 0 0 1 0 4h-.09a1.94 1.94 0 0 0-1.66 1z"></path>
              </svg>
              <span>Settings</span>
            </a>
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn-zoho" onClick={handleLogout}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;


