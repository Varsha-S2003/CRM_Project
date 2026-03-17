import React, { useState, useCallback } from 'react';

const FilterBuilder = ({ filters, onChange, onApply, onClear }) => {
  const [conditions, setConditions] = useState(filters?.conditions || []);
  const [logic, setLogic] = useState(filters?.logic || 'AND');
  
  const fields = [
    { value: 'status', label: 'Status' },
    { value: 'source', label: 'Lead Source' },
    { value: 'owner', label: 'Owner' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'updatedAt', label: 'Last Modified' },
    { value: 'company', label: 'Company' },
    { value: 'industry', label: 'Industry' },
    { value: 'rating', label: 'Rating' },
    { value: 'customFields.priority', label: 'Priority' },
    { value: 'customFields.budget', label: 'Budget' }
  ];
  
  const operators = [
    { value: 'equals', label: 'is' },
    { value: 'contains', label: 'contains' },
    { value: 'in', label: 'is one of' },
    { value: 'after', label: 'is after' },
    { value: 'before', label: 'is before' },
    { value: 'between', label: 'is between' }
  ];

  const addCondition = useCallback(() => {
    setConditions(prev => [...prev, { field: 'status', operator: 'equals', value: '' }]);
  }, []);

  const updateCondition = useCallback((index, key, value) => {
    setConditions(prev => {
      const newConditions = [...prev];
      newConditions[index] = { ...newConditions[index], [key]: value };
      return newConditions;
    });
  }, []);

  const removeCondition = useCallback((index) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleApply = () => {
    onChange({ conditions, logic });
    onApply && onApply();
  };

  const statusOptions = ['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost'];
  const sourceOptions = ['Website', 'Referral', 'Social Media', 'Email Campaign', 'Cold Call', 'Trade Show', 'Other'];
  const ratingOptions = ['hot', 'warm', 'cold'];

  const renderValueInput = (condition, index) => {
    switch (condition.field) {
      case 'status':
        return (
          <select 
            value={condition.value} 
            onChange={(e) => updateCondition(index, 'value', e.target.value)}
            className="filter-value-select"
          >
            <option value="">Select status</option>
            {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'source':
        return (
          <select 
            value={condition.value} 
            onChange={(e) => updateCondition(index, 'value', e.target.value)}
            className="filter-value-select"
          >
            <option value="">Select source</option>
            {sourceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'rating':
        return (
          <select 
            value={condition.value} 
            onChange={(e) => updateCondition(index, 'value', e.target.value)}
            className="filter-value-select"
          >
            <option value="">Select rating</option>
            {ratingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'owner':
        return <span className="filter-value-text">Me</span>;
      case 'createdAt':
      case 'updatedAt':
        if (condition.operator === 'between') {
          return (
            <div className="date-range-inputs">
              <input 
                type="date" 
                value={condition.from || ''} 
                onChange={(e) => updateCondition(index, 'from', e.target.value)}
                className="filter-date-input"
              />
              <span>to</span>
              <input 
                type="date" 
                value={condition.to || ''} 
                onChange={(e) => updateCondition(index, 'to', e.target.value)}
                className="filter-date-input"
              />
            </div>
          );
        }
        return (
          <input 
            type="date" 
            value={condition.value || ''} 
            onChange={(e) => updateCondition(index, 'value', e.target.value)}
            className="filter-date-input"
          />
        );
      default:
        return (
          <input 
            type="text" 
            value={condition.value || ''} 
            onChange={(e) => updateCondition(index, 'value', e.target.value)}
            placeholder="Enter value"
            className="filter-value-input"
          />
        );
    }
  };

  return (
    <div className="filter-builder">
      <div className="filter-builder-header">
        <div className="logic-selector">
          <span>Match</span>
          <select value={logic} onChange={(e) => setLogic(e.target.value)} className="logic-select">
            <option value="AND">All</option>
            <option value="OR">Any</option>
          </select>
          <span>of the following:</span>
        </div>
        <button className="btn-add-condition" onClick={addCondition}>
          + Add Condition
        </button>
      </div>
      
      <div className="conditions-list">
        {conditions.map((condition, index) => (
          <div key={index} className="condition-row">
            <select 
              value={condition.field} 
              onChange={(e) => updateCondition(index, 'field', e.target.value)}
              className="filter-field-select"
            >
              {fields.map(field => (
                <option key={field.value} value={field.value}>{field.label}</option>
              ))}
            </select>
            
            <select 
              value={condition.operator} 
              onChange={(e) => updateCondition(index, 'operator', e.target.value)}
              className="filter-operator-select"
            >
              {operators.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            
            {renderValueInput(condition, index)}
            
            <button 
              className="btn-remove-condition" 
              onClick={() => removeCondition(index)}
              title="Remove condition"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      {conditions.length > 0 && (
        <div className="filter-actions">
          <button className="btn-clear" onClick={onClear}>
            Clear All
          </button>
          <button className="btn-apply" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      )}
      
      {conditions.length === 0 && (
        <div className="filter-empty-state">
          <p>No conditions added. Click "Add Condition" to start building your filter.</p>
        </div>
      )}
    </div>
  );
};

export default FilterBuilder;

