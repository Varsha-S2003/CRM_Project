import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import "./App.css";
import Login from "./Login";
import Dashboard from "./Dashboard";
import AddEmployee from "./AddEmployee";
import Leads from "./Leads";
import Deals from "./Deals";
import Customers from "./Customers";
import Employees from "./Employees";
import Reports from "./Reports";
import Settings from "./Settings";

// debugging: log imported components to catch undefined values
// if you see 'undefined' for any of these it means the corresponding
// file either failed to export the component or the import path
// is incorrect (case typo, unsaved file, etc.).
console.log({
  BrowserRouter,
  Routes,
  Route,
  Link,
  Home: undefined, // placeholder, will be replaced later
  Login,
  Dashboard,
  AddEmployee,
  Leads,
  Deals,
  Customers,
  Employees,
  Reports,
  Settings,
});

function Home() {
  // log again now that Home is defined
  console.log('Home component defined? ->', Home);
  return (
    <div className="home">
      {/* Enhanced Navbar */}
      <header className="navbar">
        <div className="navbar-container">
          <div className="logo">ELOGIXA <span className="logo-highlight">CRM</span></div>
          <nav className="nav-menu">
            <Link to="#" className="nav-link">Features</Link>
            <Link to="#" className="nav-link">Solutions</Link>
            <Link to="#" className="nav-link">Pricing</Link>
            <Link to="#" className="nav-link">Resources</Link>
            <Link to="#" className="nav-link">Support</Link>
          </nav>
          <div className="nav-actions">
            <button className="icon-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </button>
            <Link to="/login" className="btn btn-outline">Login</Link>
            <Link to="/login" className="btn btn-primary">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Enhanced Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="badge-dot"></span>
              #1 CRM Software in 2024
            </div>
            <h1 className="hero-title">
              Grow Your Business with <span className="gradient-text">Elogixa CRM</span>
            </h1>
            <p className="hero-description">
              Powerful, intuitive, and affordable CRM software that helps businesses 
              streamline sales, automate marketing, and deliver exceptional customer experiences.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-primary btn-large">
                Start Free Trial
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
              <button className="btn btn-outline btn-large">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Watch Demo
              </button>
            </div>
            <div className="hero-trust">
              <span>Trusted by 10,000+ businesses worldwide</span>
              <div className="trust-logos">
                <span className="trust-logo">Acme Corp</span>
                <span className="trust-logo">TechFlow</span>
                <span className="trust-logo">GlobalSoft</span>
                <span className="trust-logo">DataSync</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="dashboard-mockup">
              <div className="mockup-header">
                <div className="mockup-dots">
                  <span></span><span></span><span></span>
                </div>
                <div className="mockup-title">Dashboard</div>
              </div>
              <div className="mockup-body">
                <div className="mockup-sidebar">
                  <div className="sidebar-item"></div>
                  <div className="sidebar-item"></div>
                  <div className="sidebar-item"></div>
                  <div className="sidebar-item"></div>
                </div>
                <div className="mockup-content">
                  <div className="mockup-cards">
                    <div className="mockup-card"></div>
                    <div className="mockup-card"></div>
                    <div className="mockup-card"></div>
                    <div className="mockup-card"></div>
                  </div>
                  <div className="mockup-chart"></div>
                </div>
              </div>
            </div>
            <div className="floating-card floating-card-1">
              <div className="fc-icon">📈</div>
              <div className="fc-text">
                <span className="fc-value">+127%</span>
                <span className="fc-label">Sales Growth</span>
              </div>
            </div>
            <div className="floating-card floating-card-2">
              <div className="fc-icon">👥</div>
              <div className="fc-text">
                <span className="fc-value">2,500+</span>
                <span className="fc-label">New Leads</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stats-container">
          <div className="stat-item">
            <div className="stat-number">10M+</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">180+</div>
            <div className="stat-label">Countries</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">25M+</div>
            <div className="stat-label">Businesses</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">99.9%</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-container">
          <div className="section-header">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Everything You Need to Succeed</h2>
            <p className="section-description">
              Powerful tools and features designed to help your business grow faster and smarter.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <h3>Contact Management</h3>
              <p>Organize and manage all your customer contacts in one centralized database with easy access.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </div>
              <h3>Sales Tracking</h3>
              <p>Track your sales pipeline in real-time and monitor performance with detailed analytics.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </div>
              <h3>Email Marketing</h3>
              <p>Create and send beautiful email campaigns to engage with your customers effectively.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <h3>Task Management</h3>
              <p>Stay organized with built-in task management and automation features.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h3>Live Chat</h3>
              <p>Connect with customers instantly through live chat and provide instant support.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20V10"></path>
                  <path d="M18 20V4"></path>
                  <path d="M6 20v-4"></path>
                </svg>
              </div>
              <h3>Advanced Analytics</h3>
              <p>Get powerful insights with customizable reports and visual dashboards.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="benefits-section">
        <div className="benefits-container">
          <div className="benefits-content">
            <span className="section-tag">Why Choose Us</span>
            <h2 className="benefits-title">Streamline Your Business with Elogixa CRM</h2>
            <p className="benefits-description">
              Our CRM platform helps you manage customer relationships, automate sales processes, 
              and drive growth with powerful features designed for modern businesses.
            </p>
            <div className="benefits-list">
              <div className="benefit-item">
                <div className="benefit-check">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="benefit-text">
                  <h4>Easy Setup & Integration</h4>
                  <p>Get started in minutes with our intuitive setup wizard</p>
                </div>
              </div>
              <div className="benefit-item">
                <div className="benefit-check">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="benefit-text">
                  <h4>Customizable Workflows</h4>
                  <p>Automate processes to save time and reduce errors</p>
                </div>
              </div>
              <div className="benefit-item">
                <div className="benefit-check">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="benefit-text">
                  <h4>Secure & Reliable</h4>
                  <p>Enterprise-grade security with 99.9% uptime</p>
                </div>
              </div>
            </div>
          </div>
          <div className="benefits-visual">
            <div className="benefits-image">
              <div className="image-card">
                <div className="card-header">
                  <span className="card-dot red"></span>
                  <span className="card-dot yellow"></span>
                  <span className="card-dot green"></span>
                </div>
                <div className="card-body">
                  <div className="chart-placeholder">
                    <div className="bar" style={{height: '60%'}}></div>
                    <div className="bar" style={{height: '80%'}}></div>
                    <div className="bar" style={{height: '45%'}}></div>
                    <div className="bar" style={{height: '90%'}}></div>
                    <div className="bar" style={{height: '70%'}}></div>
                  </div>
                </div>
              </div>
              <div className="floating-badge">
                <span className="fb-icon">🏆</span>
                <span className="fb-text">Best CRM 2024</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <h2>Ready to Transform Your Business?</h2>
          <p>Join thousands of businesses already growing with Elogixa CRM</p>
          <div className="cta-form">
            <input type="email" placeholder="Enter your work email" className="cta-input" />
            <button className="btn btn-primary btn-large">Get Started Free</button>
          </div>
          <p className="cta-note">14-day free trial • No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-main">
            <div className="footer-brand">
              <div className="logo">ELOGIXA <span className="logo-highlight">CRM</span></div>
              <p>The complete CRM solution for modern businesses. Streamline sales, automate marketing, and grow faster.</p>
              <div className="social-links">
                <a href="/" className="social-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                  </svg>
                </a>
                <a href="/" className="social-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </a>
                <a href="/" className="social-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              </div>
            </div>
            <div className="footer-links">
              <div className="footer-column">
                <h4>Product</h4>
                <a href="/">Features</a>
                <a href="/">Pricing</a>
                <a href="/">Integrations</a>
                <a href="/">Updates</a>
              </div>
              <div className="footer-column">
                <h4>Company</h4>
                <a href="/">About Us</a>
                <a href="/">Careers</a>
                <a href="/">Blog</a>
                <a href="/">Press</a>
              </div>
              <div className="footer-column">
                <h4>Resources</h4>
                <a href="/">Documentation</a>
                <a href="/">Help Center</a>
                <a href="/">Community</a>
                <a href="/">Webinars</a>
              </div>
              <div className="footer-column">
                <h4>Contact</h4>
                <a href="/">Sales</a>
                <a href="/">Support</a>
                <a href="/">Partners</a>
                <a href="/">Status</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2024 Elogixa CRM. All rights reserved.</p>
            <div className="footer-legal">
              <a href="/">Privacy Policy</a>
              <a href="/">Terms of Service</a>
              <a href="/">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-employee" element={<AddEmployee />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
