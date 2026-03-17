import React from 'react';
import { AVAILABLE_COLUMNS } from '../utils/viewsUtils';

const ColumnSelector = ({ selectedColumns, onChange, onClose }) => {
  const toggleColumn = (columnId) => {
    const newColumns = selectedColumns.includes(columnId)
      ? selectedColumns.filter(id => id !== columnId)
      : [...selectedColumns, columnId];
    onChange(newColumns);
  };

  return (
    <div className="modal-overlay-zoho" onClick={onClose}>
      <div className="modal-box-zoho column-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-zoho">
          <h2>Choose Columns</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="column-list">
          {AVAILABLE_COLUMNS.map(col => (
            <label key={col.id} className="column-item">
              <input
                type="checkbox"
                checked={selectedColumns.includes(col.id)}
                onChange={() => toggleColumn(col.id)}
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-submit" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnSelector;

