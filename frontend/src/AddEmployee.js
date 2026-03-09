
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./AddEmployee.css";

function AddEmployee() {
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    password: "",
    confirmPassword: "",
    role: "EMPLOYEE"
  });
  
  const [errors, setErrors] = useState({});
  const [availability, setAvailability] = useState({ username: null, email: null });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

  // helper to query backend for username/email availability
  const checkAvailability = async (field, value) => {
    if (!value || !value.trim()) return;
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_BASE}/api/employees/check-${field}`,
        {
          params: { [field]: value.trim().toLowerCase() },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setAvailability(prev => ({ ...prev, [field]: res.data.available }));

      setErrors(prev => {
        const next = { ...prev };
        if (!res.data.available) {
          next[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} is already taken`;
        } else {
          delete next[field];
        }
        return next;
      });
    } catch (err) {
      console.error("availability check failed", err);
    }
  };

  useEffect(() => {
    const storedRole = localStorage.getItem("role");
    if (storedRole && storedRole.toUpperCase() !== "ADMIN") {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // if user starts typing username/email again, clear any previous availability state
    if (name === "username" || name === "email") {
      setAvailability(prev => ({ ...prev, [name]: null }));
    }

    // Auto-generate username from name
    if (name === "name" && !formData.username) {
      const username = value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      setFormData(prev => ({ ...prev, username }));
    }
    
    if (errors[name]) {
      setErrors({ ...errors, [name]: "" });
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched({ ...touched, [name]: true });
    validateField(name);

    if ((name === "username" || name === "email") && value) {
      checkAvailability(name, value);
    }
  };

  const validateField = (fieldName) => {
    // compute error only for the given field
    let fieldError = "";

    switch (fieldName) {
      case "name":
        if (!formData.name.trim()) {
          fieldError = "Full name is required";
        } else if (formData.name.trim().length < 2) {
          fieldError = "Name must be at least 2 characters";
        }
        break;

      case "username":
        if (!formData.username.trim()) {
          fieldError = "Username is required";
        } else if (formData.username.length < 3) {
          fieldError = "Username must be at least 3 characters";
        } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
          fieldError = "Only letters, numbers and underscores allowed";
        }
        break;

      case "email":
        if (!formData.email.trim()) {
          fieldError = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          fieldError = "Please enter a valid email address";
        }
        break;

      case "phone":
        if (formData.phone && !/^[\d\s\-+()]{10,}$/.test(formData.phone)) {
          fieldError = "Please enter a valid phone number";
        }
        break;

      case "password":
        if (!formData.password) {
          fieldError = "Password is required";
        } else if (formData.password.length < 8) {
          fieldError = "Password must be at least 8 characters";
        } else if (!/[A-Z]/.test(formData.password)) {
          fieldError = "Must contain at least one uppercase letter";
        } else if (!/[a-z]/.test(formData.password)) {
          fieldError = "Must contain at least one lowercase letter";
        } else if (!/[0-9]/.test(formData.password)) {
          fieldError = "Must contain at least one number";
        } else if (!/[!@#$%^&*]/.test(formData.password)) {
          fieldError = "Must contain at least one special character (!@#$%^&*)";
        }
        break;

      case "confirmPassword":
        if (!formData.confirmPassword) {
          fieldError = "Please confirm your password";
        } else if (formData.password !== formData.confirmPassword) {
          fieldError = "Passwords do not match";
        }
        break;

      case "role":
        if (!formData.role) {
          fieldError = "Please select a role";
        }
        break;

      default:
        break;
    }

    setErrors(prev => {
      const next = { ...prev };
      if (fieldError) {
        next[fieldName] = fieldError;
      } else {
        delete next[fieldName];
      }
      return next;
    });
    return !fieldError;
  };

  const validateForm = () => {
    // mark all fields touched and run field-level validation
    const fields = ["name", "username", "email", "phone", "password", "confirmPassword", "role"];
    let valid = true;
    fields.forEach(field => {
      setTouched(prev => ({ ...prev, [field]: true }));
      if (!validateField(field)) valid = false;
    });
    return valid;
  };

  const getPasswordStrength = () => {
    const pwd = formData.password;
    if (!pwd) return { strength: 0, label: "", color: "" };
    
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[!@#$%^&*]/.test(pwd)) score++;
    
    if (score <= 2) return { strength: score, label: "Weak", color: "#ef4444" };
    if (score <= 4) return { strength: score, label: "Medium", color: "#f59e0b" };
    return { strength: score, label: "Strong", color: "#10b981" };
  };

  const passwordStrength = getPasswordStrength();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // make sure we checked availability -- if we haven't yet or previous check flagged unavailable,
    // run it again so we can give immediate feedback
    if (availability.username !== true) {
      await checkAvailability("username", formData.username);
    }
    if (availability.email !== true) {
      await checkAvailability("email", formData.email);
    }
    if (availability.username === false || availability.email === false) {
      alert("Please resolve the errors before submitting");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Not authenticated");
        setLoading(false);
        return;
      }

      const res = await axios.post(
        `${API_BASE}/api/employees`,
        {
          name: formData.name.trim(),
          username: formData.username.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          department: formData.department,
          designation: formData.designation,
          password: formData.password,
          role: formData.role
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert(`✅ Employee Created Successfully!\n\nEmployee ID: ${res.data.employee_id}\nUsername: ${res.data.username}\nRole: ${res.data.role}\n\nThe employee can now login to the CRM system.`);
      
      setFormData({
        name: "",
        username: "",
        email: "",
        phone: "",
        department: "",
        designation: "",
        password: "",
        confirmPassword: "",
        role: "EMPLOYEE"
      });
      setErrors({});
      setTouched({});
    } catch (err) {
      console.error(err);
      const errorMessage = err.response?.data?.message || "Failed to create employee. Please try again.";
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const isFieldInvalid = (field) => {
    return touched[field] && errors[field];
  };

  // compute readiness for submission
  const allRequiredFilled =
    formData.name.trim() &&
    formData.username.trim() &&
    formData.email.trim() &&
    formData.password &&
    formData.confirmPassword &&
    formData.role;

  const canSubmit =
    !loading &&
    allRequiredFilled &&
    Object.keys(errors).length === 0 &&
    availability.username !== false &&
    availability.email !== false;

  return (
    <div className="add-employee-page-zoho">
      <div className="add-employee-container-zoho">
        <div className="form-header-zoho">
          <button className="back-button-zoho" onClick={() => navigate("/dashboard")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <div className="header-content">
            <div className="header-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
            </div>
            <div>
              <h1>Add New Employee</h1>
              <p>Create employee credentials and access permissions</p>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="employee-form-zoho">
          {/* Personal Information Section */}
          <div className="form-section-zoho">
            <div className="section-header">
              <span className="section-number">1</span>
              <h3>Personal Information</h3>
            </div>
            
            <div className="form-grid-zoho">
              <div className={`form-group-zoho ${isFieldInvalid("name") ? "has-error" : ""}`}>
                <label>
                  Full Name <span className="required">*</span>
                </label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter full name"
                  />
                </div>
                {isFieldInvalid("name") && <span className="error-message">{errors.name}</span>}
              </div>
              
              <div className={`form-group-zoho ${isFieldInvalid("username") ? "has-error" : ""}`}>
                <label>
                  Username <span className="required">*</span>
                </label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 8v8M8 12h8"></path>
                  </svg>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter username"
                  />
                </div>
                {isFieldInvalid("username") && <span className="error-message">{errors.username}</span>}
                {!errors.username && availability.username === true && (
                  <span className="availability valid">Username is available</span>
                )}
              </div>
              
              <div className={`form-group-zoho ${isFieldInvalid("email") ? "has-error" : ""}`}>
                <label>
                  Email Address <span className="required">*</span>
                </label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter email address"
                  />
                </div>
                {isFieldInvalid("email") && <span className="error-message">{errors.email}</span>}
                {!errors.email && availability.email === true && (
                  <span className="availability valid">Email is available</span>
                )}
              </div>
              
              <div className={`form-group-zoho ${isFieldInvalid("phone") ? "has-error" : ""}`}>
                <label>Phone Number</label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"></path>
                  </svg>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter phone number"
                  />
                </div>
                {isFieldInvalid("phone") && <span className="error-message">{errors.phone}</span>}
              </div>
            </div>
          </div>
          
          {/* Job Details Section */}
          <div className="form-section-zoho">
            <div className="section-header">
              <span className="section-number">2</span>
              <h3>Job Details</h3>
            </div>
            
            <div className="form-grid-zoho">
              <div className="form-group-zoho">
                <label>Department</label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                  <select
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                  >
                    <option value="">Select Department</option>
                    <option value="Sales">Sales</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Support">Support</option>
                    <option value="IT">IT</option>
                    <option value="HR">HR</option>
                    <option value="Finance">Finance</option>
                    <option value="Operations">Operations</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group-zoho">
                <label>Designation</label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                  <input
                    type="text"
                    name="designation"
                    value={formData.designation}
                    onChange={handleChange}
                    placeholder="e.g., Sales Executive"
                  />
                </div>
              </div>
              
              <div className={`form-group-zoho ${isFieldInvalid("role") ? "has-error" : ""}`}>
                <label>
                  Role <span className="required">*</span>
                </label>
                <div className="input-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  >
                    <option value="EMPLOYEE">Employee (Sales Executive)</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>
                {isFieldInvalid("role") && <span className="error-message">{errors.role}</span>}
              </div>
            </div>
          </div>
          
          {/* Login Credentials Section */}
          <div className="form-section-zoho">
            <div className="section-header">
              <span className="section-number">3</span>
              <h3>Login Credentials</h3>
            </div>
            
            <div className="password-section">
              <div className="password-requirements-zoho">
                <div className="req-header">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4M12 8h.01"></path>
                  </svg>
                  <span>Password must meet all requirements</span>
                </div>
                <div className="req-grid">
                  <div className={`req-item ${formData.password.length >= 8 ? "valid" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`req-item ${/[A-Z]/.test(formData.password) ? "valid" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>One uppercase letter</span>
                  </div>
                  <div className={`req-item ${/[a-z]/.test(formData.password) ? "valid" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>One lowercase letter</span>
                  </div>
                  <div className={`req-item ${/[0-9]/.test(formData.password) ? "valid" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>One number</span>
                  </div>
                  <div className={`req-item ${/[!@#$%^&*]/.test(formData.password) ? "valid" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>One special character (!@#$%^&*)</span>
                  </div>
                </div>
                {formData.password && (
                  <div className="password-strength">
                    <div className="strength-bar">
                      <div 
                        className="strength-fill" 
                        style={{ 
                          width: `${(passwordStrength.strength / 6) * 100}%`,
                          backgroundColor: passwordStrength.color 
                        }}
                      ></div>
                    </div>
                    <span className="strength-label" style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="form-grid-zoho">
                <div className={`form-group-zoho ${isFieldInvalid("password") ? "has-error" : ""}`}>
                  <label>
                    Password <span className="required">*</span>
                  </label>
                  <div className="input-wrapper password-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Enter password"
                    />
                    <button 
                      type="button" 
                      className="toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  {isFieldInvalid("password") && <span className="error-message">{errors.password}</span>}
                </div>
                
                <div className={`form-group-zoho ${isFieldInvalid("confirmPassword") ? "has-error" : ""}`}>
                  <label>
                    Confirm Password <span className="required">*</span>
                  </label>
                  <div className="input-wrapper password-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Confirm password"
                    />
                    <button 
                      type="button" 
                      className="toggle-password"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  {isFieldInvalid("confirmPassword") && <span className="error-message">{errors.confirmPassword}</span>}
                </div>
              </div>
            </div>
          </div>
          
          <div className="form-actions-zoho">
            <button type="button" className="btn-cancel-zoho" onClick={() => navigate("/dashboard")}>
              Cancel
            </button>
            <button type="submit" className="btn-submit-zoho" disabled={!canSubmit}>
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Creating...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                  Create Employee
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddEmployee;

