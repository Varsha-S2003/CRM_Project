// Default column options for leads table
export const DEFAULT_COLUMNS = [
  'name',
  'company', 
  'email',
  'phone',
  'status',
  'source',
  'rating',
  'assignedTo',
  'createdAt'
];

// Available columns with labels
export const AVAILABLE_COLUMNS = [
  { id: 'name', label: 'Name', type: 'text' },
  { id: 'company', label: 'Company', type: 'text' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'phone', label: 'Phone', type: 'phone' },
  { id: 'mobile', label: 'Mobile', type: 'phone' },
  { id: 'status', label: 'Status', type: 'badge' },
  { id: 'source', label: 'Source', type: 'text' },
  { id: 'rating', label: 'Rating', type: 'badge' },
  { id: 'assignedTo', label: 'Owner', type: 'user' },
  { id: 'industry', label: 'Industry', type: 'text' },
  { id: 'createdAt', label: 'Created', type: 'date' },
  { id: 'updatedAt', label: 'Updated', type: 'date' },
  { id: 'customFields.priority', label: 'Priority', type: 'text' }
];

// Default filter presets
export const DEFAULT_VIEWS = {
  allLeads: {
    name: 'All Leads',
    filters: {},
    columns: DEFAULT_COLUMNS,
    sort: { createdAt: -1 }
  },
  myLeads: {
    name: 'My Leads',
    filters: {
      conditions: [{ field: 'owner', operator: 'equals', value: true }],
      logic: 'AND'
    },
    columns: ['name', 'company', 'status', 'assignedTo'],
    sort: { updatedAt: -1 }
  }
};

// Filter operators by field type
export const FILTER_OPERATORS = {
  text: ['equals', 'contains'],
  select: ['equals', 'in'],
  date: ['after', 'before', 'between'],
  number: ['equals', 'gt', 'lt']
};

// Build filter payload for API
export const buildFilterPayload = (conditions, logic = 'AND') => ({
  conditions,
  logic
});

// Get column label
export const getColumnLabel = (columnId) => {
  const col = AVAILABLE_COLUMNS.find(c => c.id === columnId);
  return col ? col.label : columnId;
};

// Format value for display in table
export const formatColumnValue = (lead, columnId) => {
  switch (columnId) {
    case 'status':
      return <span className={`status-badge-zoho ${lead.status}`}>{lead.status}</span>;
    case 'rating':
      return <span className={`rating-badge ${lead.rating}`}>{lead.rating}</span>;
    case 'assignedTo':
      return lead.assignedTo?.username || 'Unassigned';
    case 'createdAt':
    case 'updatedAt':
      return new Date(lead[columnId]).toLocaleDateString();
    default:
      return lead[columnId] || '-';
  }
};

