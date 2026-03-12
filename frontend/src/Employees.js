import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Employees.css";

export default function Employees() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(response.data || []);
    } catch (err) {
      console.error("Failed to fetch employees", err);
      setError(err.response?.data?.message || "Unable to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const managerCount = employees.filter((employee) => employee.role === "MANAGER").length;
  const employeeCount = employees.filter((employee) => employee.role === "EMPLOYEE").length;

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content employees-page">
        <div className="employees-shell">
          <div className="employees-hero">
            <div>
              <h1>Employee Directory</h1>
              <p>All employees added by the admin will appear here for quick review.</p>
            </div>
            <button
              type="button"
              className="employees-add-btn"
              onClick={() => navigate("/add-employee")}
            >
              Add Employee
            </button>
          </div>

          <div className="employees-stats">
            <div className="stat-card">
              <span>Total Staff</span>
              <strong>{loading ? "--" : employees.length}</strong>
            </div>
            <div className="stat-card">
              <span>Managers</span>
              <strong>{loading ? "--" : managerCount}</strong>
            </div>
            <div className="stat-card">
              <span>Employees</span>
              <strong>{loading ? "--" : employeeCount}</strong>
            </div>
          </div>

          <div className="employees-panel">
            <div className="employees-panel-head">
              <div>
                <h2>Users</h2>
                <p>Showing the employee accounts created from the admin panel.</p>
              </div>
              <button type="button" className="employees-refresh-btn" onClick={fetchEmployees}>
                Refresh
              </button>
            </div>

            {error && <div className="employees-message error">{error}</div>}

            {!loading && !error && employees.length === 0 && (
              <div className="employees-empty">
                No employees have been added yet.
              </div>
            )}

            {!error && employees.length > 0 && (
              <div className="employees-grid">
                {employees.map((employee) => (
                  <div key={employee._id || employee.id} className="employee-card">
                    <div className="employee-card-top">
                      <div className="employee-avatar">
                        {(employee.name || employee.username || "U").charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`employee-role-badge ${
                          employee.role === "MANAGER" ? "manager" : ""
                        }`}
                      >
                        {employee.role}
                      </span>
                    </div>
                    <h3 className="employee-name">{employee.name || employee.username}</h3>
                    <p className="employee-username">@{employee.username}</p>

                    <div className="employee-meta">
                      <div>
                        <span>Employee ID</span>
                        <span>{employee.employee_id || "--"}</span>
                      </div>
                      <div>
                        <span>Email</span>
                        <span>{employee.email || "--"}</span>
                      </div>
                      <div>
                        <span>Phone</span>
                        <span>{employee.phone || "--"}</span>
                      </div>
                      <div>
                        <span>Department</span>
                        <span>{employee.department || "--"}</span>
                      </div>
                      <div>
                        <span>Designation</span>
                        <span>{employee.designation || "--"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
