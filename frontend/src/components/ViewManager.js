import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ViewManager = ({ currentViewId, onViewSelect, onSaveView, onUpdateView, onDeleteView }) => {
  const [views, setViews] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingView, setEditingView] = useState(null);
  const [newViewName, setNewViewName] = useState('');
  const [viewVisibility, setViewVisibility] = useState('private');

  const token = localStorage.getItem('token');
  const apiHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchViews();
  }, []);

  const fetchViews = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/leads/views', { headers: apiHeaders });
      setViews(res.data);
    } catch (err) {
      console.error('Failed to fetch views:', err);
    }
  };

  const handleSaveAsNew = () => {
    setEditingView(null);
    setNewViewName('');
    setViewVisibility('private');
    setShowSaveModal(true);
  };

  const handleEditCurrent = () => {
    const currentView = views.find(v => v._id === currentViewId);
    if (currentView) {
      setEditingView(currentView);
      setNewViewName(currentView.name);
      setViewVisibility(currentView.visibility);
      setShowSaveModal(true);
    }
  };

  const handleSaveView = async () => {
    try {
      const viewData = {
        name: newViewName,
        visibility: viewVisibility,
        // Current state will be captured by parent Leads.js
      };

      if (editingView) {
        // Update existing
        await axios.put(`http://localhost:5000/api/leads/views/${editingView._id}`, viewData, { headers: apiHeaders });
        onUpdateView && onUpdateView(editingView._id);
      } else {
        // Create new
        const newView = await axios.post('http://localhost:5000/api/leads/views', viewData, { headers: apiHeaders });
        onSaveView && onSaveView(newView.data);
      }
      
      setShowSaveModal(false);
      fetchViews();
    } catch (err) {
      console.error('Failed to save view:', err);
      alert('Failed to save view');
    }
  };

  const handleDeleteView = async (viewId) => {
    if (!window.confirm('Delete this view?')) return;
    
    try {
      await axios.delete(`http://localhost:5000/api/leads/views/${viewId}`, { headers: apiHeaders });
      fetchViews();
      if (currentViewId === viewId) {
        onViewSelect(null);
      }
      onDeleteView && onDeleteView(viewId);
    } catch (err) {
      console.error('Failed to delete view:', err);
      alert('Failed to delete view');
    }
  };

  const seedDefaults = async () => {
    try {
      await axios.post('http://localhost:5000/api/leads/views/seed-defaults', {}, { headers: apiHeaders });
      fetchViews();
      alert('Default views added!');
    } catch (err) {
      console.error('Failed to seed defaults:', err);
    }
  };

  return (
    <div className="view-manager">
      {/* View Selector */}
      <div className="view-selector">
        <select 
          value={currentViewId || ''} 
          onChange={(e) => onViewSelect(e.target.value || null)}
          className="view-select"
        >
          <option value="">All Leads</option>
          {views.map(view => (
            <option key={view._id} value={view._id}>
              {view.name} {view.visibility === 'shared' && '(shared)'} {view.userId !== localStorage.getItem('userId') && '(you)'}
            </option>
          ))}
        </select>
        
        <div className="view-actions">
          <button className="btn-view-action" onClick={handleSaveAsNew} title="Save current view as new">
            💾 Save As New
          </button>
          <button 
            className="btn-view-action" 
            onClick={handleEditCurrent} 
            disabled={!currentViewId}
            title="Edit current view"
          >
            ✏️ Edit
          </button>
          <button 
            className="btn-view-action" 
            onClick={() => handleDeleteView(currentViewId)} 
            disabled={!currentViewId}
            title="Delete current view"
          >
            🗑️ Delete
          </button>
          <button className="btn-view-action" onClick={seedDefaults} title="Add default views">
            🔄 Defaults
          </button>
        </div>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="modal-overlay-zoho" onClick={() => setShowSaveModal(false)}>
          <div className="modal-box-zoho" onClick={e => e.stopPropagation()}>
            <div className="modal-header-zoho">
              <h2>{editingView ? 'Edit View' : 'Save New View'}</h2>
              <button className="modal-close" onClick={() => setShowSaveModal(false)}>×</button>
            </div>
            <div className="modal-form-zoho">
              <div className="form-group">
                <label>View Name</label>
                <input
                  type="text"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Enter view name"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Visibility</label>
                <select
                  value={viewVisibility}
                  onChange={(e) => setViewVisibility(e.target.value)}
                  className="form-select"
                >
                  <option value="private">Private (just me)</option>
                  <option value="shared">Shared (all users)</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowSaveModal(false)}>
                  Cancel
                </button>
                <button className="btn-submit" onClick={handleSaveView}>
                  {editingView ? 'Update View' : 'Save View'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewManager;

