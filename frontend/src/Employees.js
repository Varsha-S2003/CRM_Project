import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Employees.css";

export default function Employees() {
  const navigate = useNavigate();
  const role = (localStorage.getItem("role") || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    role: "EMPLOYEE",
    reportsTo: "",
  });
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState("");
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

  const managers = employees.filter((employee) => employee.role === "MANAGER");

  const handleCardClick = (employee) => {
    const employeeId = employee._id || employee.id;
    setSelectedEmployeeId((prev) => (prev === employeeId ? "" : employeeId));
    setEditingEmployeeId("");
    setError("");
  };

  const startEdit = (employee) => {
    const employeeId = employee._id || employee.id;
    setEditingEmployeeId(employeeId);
    setSelectedEmployeeId(employeeId);
    setEditForm({
      name: employee.name || "",
      email: employee.email || "",
      phone: employee.phone || "",
      department: employee.department || "",
      designation: employee.designation || "",
      role: employee.role || "EMPLOYEE",
      reportsTo: employee.reportsTo || "",
    });
  };

  const cancelEdit = () => {
    setEditingEmployeeId("");
  };

  const saveEmployee = async (employeeId) => {
    try {
      if (!editForm.name.trim() || !editForm.email.trim() || !editForm.department.trim() || !editForm.role) {
        setError("Name, email, role and department are required.");
        return;
      }

      if (editForm.role === "EMPLOYEE" && !String(editForm.reportsTo || "").trim()) {
        setError("Reporting manager is required for employee role.");
        return;
      }

      setSavingEmployee(true);
      setError("");
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_BASE}/api/employees/${employeeId}`,
        {
          name: editForm.name.trim(),
          email: editForm.email.trim().toLowerCase(),
          phone: String(editForm.phone || "").trim(),
          department: editForm.department.trim(),
          designation: String(editForm.designation || "").trim(),
          role: editForm.role,
          reportsTo: editForm.role === "EMPLOYEE" ? String(editForm.reportsTo || "").trim() : null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      await fetchEmployees();
      setEditingEmployeeId("");
      setSelectedEmployeeId(employeeId);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update employee.");
    } finally {
      setSavingEmployee(false);
    }
  };

  const deleteEmployee = async (employeeId) => {
    const employee = employees.find((item) => (item._id || item.id) === employeeId);
    const label = employee?.name || employee?.username || "this employee";
    const confirmed = window.confirm(`Are you sure you want to delete ${label}?`);
    if (!confirmed) return;

    try {
      setDeletingEmployeeId(employeeId);
      setError("");
      const token = localStorage.getItem("token");
      await axios.delete(`${API_BASE}/api/employees/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees((prev) => prev.filter((item) => (item._id || item.id) !== employeeId));
      setSelectedEmployeeId((prev) => (prev === employeeId ? "" : prev));
      setEditingEmployeeId((prev) => (prev === employeeId ? "" : prev));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete employee.");
    } finally {
      setDeletingEmployeeId("");
    }
  };

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
          </div>

          <div className="employees-stats">
            <div className="stat-card employees-stat-card">
              <span>Total Staff</span>
              <strong>{loading ? "--" : employees.length}</strong>
            </div>
            <div className="stat-card employees-stat-card">
              <span>Managers</span>
              <strong>{loading ? "--" : managerCount}</strong>
            </div>
            <div className="stat-card employees-stat-card">
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
              <div className="employees-actions">
                {isAdmin && (
                  <button
                    type="button"
                    className="employees-add-btn"
                    onClick={() => navigate("/add-employee")}
                  >
                    Add Employee
                  </button>
                )}
              </div>
            </div>

            {error && <div className="employees-message error">{error}</div>}

            {!loading && !error && employees.length === 0 && (
              <div className="employees-empty">
                No employees have been added yet.
              </div>
            )}

            {!error && employees.length > 0 && (
              <div className="employees-grid">
                {employees.map((employee) => {
                  const employeeId = employee._id || employee.id;
                  const isSelected = selectedEmployeeId === employeeId;
                  const isEditing = editingEmployeeId === employeeId;
                  const reportsToValue = String(editForm.reportsTo || "");

                  return (
                  <div
                    key={employeeId}
                    className={`employee-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => handleCardClick(employee)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleCardClick(employee);
                      }
                    }}
                  >
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

                    {isSelected && isAdmin && (
                      <div className="employee-card-actions" onClick={(event) => event.stopPropagation()}>
                        {!isEditing ? (
                          <>
                            <button type="button" className="employee-action-btn edit" onClick={() => startEdit(employee)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="employee-action-btn delete"
                              onClick={() => deleteEmployee(employeeId)}
                              disabled={deletingEmployeeId === employeeId}
                            >
                              {deletingEmployeeId === employeeId ? "Deleting..." : "Delete"}
                            </button>
                          </>
                        ) : (
                          <div className="employee-edit-form">
                            <label>
                              Full Name
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                              />
                            </label>
                            <label>
                              Email
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                              />
                            </label>
                            <label>
                              Phone
                              <input
                                type="text"
                                value={editForm.phone}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
                              />
                            </label>
                            <label>
                              Department
                              <select
                                value={editForm.department}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, department: event.target.value }))}
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
                            </label>
                            <label>
                              Designation
                              <input
                                type="text"
                                value={editForm.designation}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, designation: event.target.value }))}
                              />
                            </label>
                            <label>
                              Role
                              <select
                                value={editForm.role}
                                onChange={(event) => {
                                  const nextRole = event.target.value;
                                  setEditForm((prev) => ({
                                    ...prev,
                                    role: nextRole,
                                    reportsTo: nextRole === "EMPLOYEE" ? prev.reportsTo : "",
                                  }));
                                }}
                              >
                                <option value="EMPLOYEE">Employee</option>
                                <option value="MANAGER">Manager</option>
                              </select>
                            </label>
                            {editForm.role === "EMPLOYEE" && (
                              <label>
                                Reporting Manager
                                <select
                                  value={reportsToValue}
                                  onChange={(event) => setEditForm((prev) => ({ ...prev, reportsTo: event.target.value }))}
                                >
                                  <option value="">Select Reporting Manager</option>
                                  {managers
                                    .filter((manager) => (manager._id || manager.id) !== employeeId)
                                    .map((manager) => (
                                      <option key={manager._id || manager.id} value={manager._id || manager.id}>
                                        {(manager.name || manager.username || manager.email || "Manager").trim()}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            )}
                            <div className="employee-edit-actions">
                              <button
                                type="button"
                                className="employee-action-btn edit"
                                onClick={() => saveEmployee(employeeId)}
                                disabled={savingEmployee}
                              >
                                {savingEmployee ? "Saving..." : "Save"}
                              </button>
                              <button type="button" className="employee-action-btn" onClick={cancelEdit}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
