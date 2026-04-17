import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import "./App.css";
import Login from "./Login";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import Dashboard from "./Dashboard";
import AddEmployee from "./AddEmployee";
import Leads from "./Leads";
import Deals from "./Deals";
import Customers from "./Customers";
import Employees from "./Employees";
import Reports from "./Reports";
import Settings from "./Settings";
import LeadRequests from "./LeadRequests";

import ActivityModule from "./ActivityModule";
import UsecaseModule from "./UsecaseModule";
import DocumentsModule from "./DocumentsModule";
import QuotationsModule from "./QuotationsModule";
import InvoicesModule from "./InvoicesModule";
import PaymentsPage from "./PaymentsPage";
import PayInvoicePage from "./PayInvoicePage";

import Products from "./Products";
import Inventory from "./Inventory";
import VendorsPage from "./pages/VendorsPage";
import VendorDetailPage from "./pages/VendorDetailPage";
import NotificationsPage from "./pages/NotificationsPage";
 //bf512acb77558d0d630c7a57df7507f896003d97

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
  ActivityModule,
});

function Home() {
  const crmDemoUrl = "https://www.youtube.com/results?search_query=crm+demo+for+beginners";

  // log again now that Home is defined
  console.log('Home component defined? ->', Home);
  return (
    <div className="home">
      {/* Enhanced Navbar */}
      <header className="navbar">
        <div className="navbar-container">
          <div className="logo">ELOGIXA <span className="logo-highlight">CRM</span></div>
          <nav className="nav-menu">
            <a href="#features" className="nav-link">Features</a>
            <a href="#solutions" className="nav-link">Solutions</a>
            <a href="#resources" className="nav-link">Resources</a>
            <a href="#support" className="nav-link">Support</a>
          </nav>
          <div className="nav-actions">
            <Link to="/login" className="btn btn-primary">Login</Link>
          </div>
        </div>
      </header>

      {/* Enhanced Hero Section */}
      <section className="hero" id="top">
        <div className="hero-orb hero-orb-1"></div>
        <div className="hero-orb hero-orb-2"></div>
        <div className="hero-orb hero-orb-3"></div>
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title animate-rise animate-delay-1">
              Grow Your Business with <span className="gradient-text">Elogixa CRM</span>
            </h1>
            <p className="hero-description animate-rise animate-delay-2">
              Powerful, intuitive, and affordable CRM software that helps businesses 
              streamline sales, automate marketing, and deliver exceptional customer experiences.
            </p>
            <div className="hero-actions animate-rise animate-delay-3">
              <a
                href={crmDemoUrl}
                className="btn btn-outline btn-large"
                target="_blank"
                rel="noreferrer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Watch Demo
              </a>
            </div>
          </div>
          <div className="hero-visual animate-float-in">
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
                <span className="fc-value">+35%</span>
                <span className="fc-label">Sales Growth</span>
              </div>
            </div>
            <div className="floating-card floating-card-2">
              <div className="fc-icon">👥</div>
              <div className="fc-text">
                <span className="fc-value">450+</span>
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
            <div className="stat-number">50K+</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">15+</div>
            <div className="stat-label">Countries</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">5K+</div>
            <div className="stat-label">Businesses</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">99.5%</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" id="features">
        <div className="section-container">
          <div className="section-header animate-rise">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Everything You Need to Succeed</h2>
            <p className="section-description">
              Powerful tools and features designed to help your business grow faster and smarter.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card stagger-card">
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
            <div className="feature-card stagger-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </div>
              <h3>Sales Tracking</h3>
              <p>Track your sales pipeline in real-time and monitor performance with detailed analytics.</p>
            </div>
            <div className="feature-card stagger-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </div>
              <h3>Email Marketing</h3>
              <p>Create and send beautiful email campaigns to engage with your customers effectively.</p>
            </div>
            <div className="feature-card stagger-card">
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

            <div className="feature-card stagger-card">
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
      <section className="benefits-section" id="solutions">
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
            </div>
          </div>
        </div>
      </section>



      {/* Footer */}
      <footer className="footer" id="resources">
        <div className="footer-container">
          <div className="footer-bottom" id="support">
            <p>© 2026 <a href="https://elogixa.co.in/" target="_blank" rel="noreferrer">Your CRM</a></p>
            <div className="footer-legal">
              <a href="/">Help</a>
              <a href="/">Support</a>
              <a href="/">Status</a>
              <a href="/">Privacy Policy</a>
              <a href="/">Terms of Service</a>
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
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-employee" element={<AddEmployee />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/requests" element={<LeadRequests />} />
        <Route path="/activities" element={<ActivityModule />} />
        <Route path="/usecases" element={<UsecaseModule />} />
        <Route path="/documents" element={<DocumentsModule />} />
        <Route path="/quotations" element={<QuotationsModule />} />
        <Route path="/invoices" element={<InvoicesModule />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/pay-invoice" element={<PayInvoicePage />} />
        <Route path="/products" element={<Products />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/vendors/:id" element={<VendorDetailPage />} />
        </Routes>
    </BrowserRouter>
  );
}

export default App;
