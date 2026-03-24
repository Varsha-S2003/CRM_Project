import React, { useCallback, useEffect, useState } from "react";

const stageOptions = [
  "qualification",
  "need_analysis",
  "value_proposition",
  "proposal_price_quote",
  "negotiate",
  "won",
  "lost",
];

const statusOptions = ["Active", "Inactive"];
const dealTypeOptions = ["New Business", "Existing Business", "Renewal", "Upsell", "Other"];

const fields = [
  { value: "stage", label: "Stage" },
  { value: "status", label: "Status" },
  { value: "dealType", label: "Deal Type" },
  { value: "leadSource", label: "Lead Source" },
  { value: "company", label: "Company" },
  { value: "contact", label: "Contact" },
  { value: "owner", label: "Owner" },
  { value: "createdAt", label: "Created Date" },
  { value: "updatedAt", label: "Last Modified" },
];

const operators = [
  { value: "equals", label: "is" },
  { value: "contains", label: "contains" },
  { value: "in", label: "is one of" },
  { value: "after", label: "is after" },
  { value: "before", label: "is before" },
  { value: "between", label: "is between" },
];

function DealFilterBuilder({ filters, onChange, onApply, onClear }) {
  const [conditions, setConditions] = useState(filters?.conditions || []);
  const [logic, setLogic] = useState(filters?.logic || "AND");

  useEffect(() => {
    setConditions(filters?.conditions || []);
    setLogic(filters?.logic || "AND");
  }, [filters]);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { field: "stage", operator: "equals", value: "" }]);
  }, []);

  const updateCondition = useCallback((index, key, value) => {
    setConditions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }, []);

  const removeCondition = useCallback((index) => {
    setConditions((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const handleApply = () => {
    const nextFilters = { conditions, logic };
    onChange(nextFilters);
    if (onApply) onApply(nextFilters);
  };

  const renderValueInput = (condition, index) => {
    switch (condition.field) {
      case "stage":
        return (
          <select
            value={condition.value}
            onChange={(event) => updateCondition(index, "value", event.target.value)}
            className="filter-value-select"
          >
            <option value="">Select stage</option>
            {stageOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        );
      case "status":
        return (
          <select
            value={condition.value}
            onChange={(event) => updateCondition(index, "value", event.target.value)}
            className="filter-value-select"
          >
            <option value="">Select status</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "dealType":
        return (
          <select
            value={condition.value}
            onChange={(event) => updateCondition(index, "value", event.target.value)}
            className="filter-value-select"
          >
            <option value="">Select deal type</option>
            {dealTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "owner":
        return <span className="filter-value-text">Me</span>;
      case "createdAt":
      case "updatedAt":
        if (condition.operator === "between") {
          return (
            <div className="date-range-inputs">
              <input
                type="date"
                value={condition.from || ""}
                onChange={(event) => updateCondition(index, "from", event.target.value)}
                className="filter-date-input"
              />
              <span>to</span>
              <input
                type="date"
                value={condition.to || ""}
                onChange={(event) => updateCondition(index, "to", event.target.value)}
                className="filter-date-input"
              />
            </div>
          );
        }
        return (
          <input
            type="date"
            value={condition.value || ""}
            onChange={(event) => updateCondition(index, "value", event.target.value)}
            className="filter-date-input"
          />
        );
      default:
        return (
          <input
            type="text"
            value={condition.value || ""}
            onChange={(event) => updateCondition(index, "value", event.target.value)}
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
          <select value={logic} onChange={(event) => setLogic(event.target.value)} className="logic-select">
            <option value="AND">All</option>
            <option value="OR">Any</option>
          </select>
          <span>of the following:</span>
        </div>
        <button type="button" className="btn-add-condition" onClick={addCondition}>
          + Add Condition
        </button>
      </div>

      <div className="conditions-list">
        {conditions.map((condition, index) => (
          <div key={index} className="condition-row">
            <select
              value={condition.field}
              onChange={(event) => updateCondition(index, "field", event.target.value)}
              className="filter-field-select"
            >
              {fields.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>

            <select
              value={condition.operator}
              onChange={(event) => updateCondition(index, "operator", event.target.value)}
              className="filter-operator-select"
            >
              {operators.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>

            {renderValueInput(condition, index)}

            <button
              type="button"
              className="btn-remove-condition"
              onClick={() => removeCondition(index)}
              title="Remove condition"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {conditions.length > 0 && (
        <div className="filter-actions">
          <button type="button" className="btn-clear" onClick={onClear}>
            Clear All
          </button>
          <button type="button" className="btn-apply" onClick={handleApply}>
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
}

export default DealFilterBuilder;
